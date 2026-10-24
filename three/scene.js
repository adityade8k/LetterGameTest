import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { DESIGN } from './design.js';
import { celMaterial, atmosphereMaterial, smokeMaterial } from './materials.js';
import { createUI } from './ui.js';
import { createPickupFaces } from './icons.js';
import { pickupEffectFromYaw } from './pickup-facing.mjs';
import { tileLayout, fitFaceObject } from './tile-layout.mjs';
import { viewportLayout } from './layout.mjs';

function roundedSquare(size) {
  const half = size / 2 - DESIGN.tile.bevel, r = DESIGN.tile.corner;
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half); shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r); shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half); shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r); shape.quadraticCurveTo(-half, -half, -half + r, -half);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: DESIGN.tile.depth, bevelEnabled: true, bevelThickness: DESIGN.tile.bevel,
    bevelSize: DESIGN.tile.bevel, bevelSegments: 3, steps: 1, curveSegments: 8,
  });
  geometry.translate(0, 0, -DESIGN.tile.depth / 2);
  return geometry;
}

export async function createScene(host, config, reducedMotion) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DESIGN.pixelRatioLimit));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', 'Loading falling letters');
  host.append(canvas);
  const font = await new FontLoader().loadAsync('vendor/three/helvetiker_bold.typeface.json');
  const ui = createUI(font, config, reducedMotion);
  const camera = new THREE.OrthographicCamera(-180, 180, 320, -320, .1, 100);
  camera.position.z = 60;
  let layout;
  const background = new THREE.Scene(), scene = new THREE.Scene();
  const skyMaterial = atmosphereMaterial();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(360, 640), skyMaterial);
  sky.position.z = -25; background.add(sky);
  const materials = Object.fromEntries(['cream','plum','gold','mint'].map(key => [key, celMaterial(DESIGN.palette[key], {
    specularStrength:key==='plum'?0:DESIGN.tile.specularStrength,shininess:DESIGN.tile.shininess,
  })]));
  const geometry = roundedSquare(config.tiles.mobileSize);
  const shadowGeometry = new THREE.PlaneGeometry(80, 80);
  const textCache = new Map();
  const bodies = new Map(), transfers = [], clouds = [];
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const smoke = smokeMaterial();
  const cloudGeometry = new THREE.PlaneGeometry(1, 1);
  const shadow = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;void main(){float d=length((vUv-.5)*2.);gl_FragColor=vec4(.40,.25,.30,(1.-smoothstep(.12,1.,d))*.21);}',
  });

  function textMesh(text, size, depth = DESIGN.tile.letterDepth) {
    const key = `${text}:${size}:${depth}`;
    if (!textCache.has(key)) {
      const geo = new TextGeometry(text, { font, size, depth, curveSegments: 4, bevelEnabled: true, bevelThickness: .35, bevelSize: .25, bevelSegments: 1 });
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      geo.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, 0);
      textCache.set(key, geo);
    }
    return new THREE.Mesh(textCache.get(key), materials.plum);
  }
  const face=tileLayout(config.tiles.mobileSize);
  const faceDepth=DESIGN.tile.depth/2+DESIGN.tile.bevel+.55;
  function placeFace(object,zone,z=faceDepth){
    const bounds=new THREE.Box3().setFromObject(object);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const fit=fitFaceObject({width:size.x,height:size.y,centerX:center.x,centerY:center.y},zone);
    object.scale.setScalar(fit.scale);object.position.set(fit.x,fit.y,z);return object;
  }
  function build(tile) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geometry, materials[tile.kind === 'hourglass' ? 'mint' : tile.bonus ? 'gold' : 'cream']);
    group.add(body);
    const front = new THREE.Group();
    if (tile.kind === 'hourglass') {
      group.add(createPickupFaces(materials.plum,materials.gold,faceDepth));
    } else {
      // Separate typographic zones: badge row, letter, then point value.
      // Every glyph is fitted by its actual geometry, including wide W/M.
      if(!tile.blank)front.add(placeFace(textMesh(tile.letter,25),face.letter));
      front.add(placeFace(textMesh(String(tile.blank?0:config.letterPoints[tile.letter]),5.5,.65),face.points));
      if(tile.bonus)front.add(placeFace(textMesh(`x${config.bonusLetters.timeMultiplier}`,6,.8),face.bonus));
    }
    // Rotate a second face outward so its lettering reads normally from behind.
    // Cloning reuses the cached geometries and materials on both sides.
    if(tile.kind!=='hourglass'){
      const back = front.clone();back.rotation.y = Math.PI;group.add(front, back);
    }
    group.userData.tile = tile;
    const halo = new THREE.Mesh(shadowGeometry, shadow); halo.position.z = -8; halo.renderOrder = -1;
    scene.add(halo, group);
    const fades=new Map();
    if(tile.bornAt!==undefined)group.traverse(object=>{
      if(!object.isMesh)return;
      const source=object.material;
      if(!fades.has(source)){const material=source.clone();material.transparent=true;material.depthWrite=false;fades.set(source,material);}
      object.material=fades.get(source);
    });
    const model = { group, halo, fades }; bodies.set(tile, model); return model;
  }
  function removeBody(tile, model) {
    scene.remove(model.group, model.halo);
    for (const material of model.fades.values()) material.dispose();
    bodies.delete(tile);
  }
  function removeTransfer(transfer) {
    scene.remove(transfer.group);
    for (const material of transfer.materials) material.dispose();
  }
  function clearTransfers() {
    for (const transfer of transfers) removeTransfer(transfer);
    transfers.length = 0;
  }
  function transferTarget(transfer) {
    if(transfer.target==='smoke')return {x:transfer.x,y:transfer.y};
    const kind = transfer.target === 'timer' ? 'hourglass' : 'letter';
    return ui.selectionTarget?.(transfer.index, kind) || (kind === 'hourglass'
      ? { x: layout.left + 320, y: layout.top + 87 }
      : { x: layout.left + 55 + Math.min(transfer.index, 7) * 21, y: layout.height - layout.bottom - 117 });
  }
  function resize(){
    const style=getComputedStyle(host);
    layout=viewportLayout(host.clientWidth,host.clientHeight,parseFloat(style.getPropertyValue('--safe-top'))||0,parseFloat(style.getPropertyValue('--safe-bottom'))||0);
    renderer.setSize(host.clientWidth,host.clientHeight,false);
    camera.left=-layout.width/2;camera.right=layout.width/2;camera.top=layout.height/2;camera.bottom=-layout.height/2;camera.updateProjectionMatrix();
    sky.scale.set(layout.width/360,layout.height/640,1);ui.resize(layout);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function render(tiles, game, dt, now, hover, view) {
    const visible = new Set(tiles);
    for (const [tile, model] of bodies) if (!visible.has(tile)) removeBody(tile, model);
    for (const tile of tiles) {
      const model = bodies.get(tile) || build(tile);
      const previewFloat = game.phase === 'ready' && !reducedMotion ? Math.sin(now * .0008 + tile.x) * 3 : 0;
      model.group.position.set(tile.x-layout.width/2,layout.height/2-tile.y+previewFloat,0);
      // Logical Y points down, so negate the letter's screen-plane Z angle.
      model.group.rotation.set(0,tile.kind==='hourglass'?(tile.yaw||0):0,tile.kind==='hourglass'?0:-(tile.tilt||0),'ZXY');
      // Hover lifts the tile, without growing its collision silhouette.
      if (tile === hover && game.phase === 'running') model.group.position.z = 1.5;
      model.halo.position.set(tile.x-layout.width/2+7,layout.height/2-tile.y-12+previewFloat,-8);
      if(model.fades.size){
        const opacity=Math.min(1,Math.max(0,(game.elapsed-tile.bornAt)/config.falling.replacementFadeSeconds));
        for(const material of model.fades.values())material.uniforms.opacity.value=opacity;
        if(opacity>=1){
          const originals=new Map([...model.fades].map(([source,clone])=>[clone,source]));
          model.group.traverse(object=>{if(originals.has(object.material))object.material=originals.get(object.material);});
          for(const material of model.fades.values())material.dispose();model.fades.clear();
        }
      }
    }
    for (let i = transfers.length - 1; i >= 0; i--) {
      const transfer = transfers[i];
      transfer.age += game.phase === 'running' ? dt : 0;
      const progress = Math.min(1, transfer.age / transfer.duration);
      if (progress >= 1) { removeTransfer(transfer); transfers.splice(i, 1); continue; }
      const eased = 1 - (1 - progress) ** 3;
      const destination = transferTarget(transfer);
      const x = transfer.x + (destination.x - transfer.x) * eased;
      const y = transfer.y + (destination.y - transfer.y) * eased - Math.sin(progress * Math.PI) * 8;
      transfer.group.position.set(x - layout.width / 2, layout.height / 2 - y, 6);
      transfer.group.scale.setScalar(1 - eased * .68);
      transfer.group.rotation.x = transfer.rotation.x * (1 - eased);
      transfer.group.rotation.y = transfer.target==='smoke' ? transfer.rotation.y : transfer.rotation.y * (1 - eased);
      transfer.group.rotation.z = transfer.rotation.z * (1 - eased);
      const opacity = 1 - Math.max(0, (progress - .45) / .55);
      for (const material of transfer.materials) material.uniforms.opacity.value = opacity;
    }
    const age = config.smoke.durationSeconds - game.effects.smoke;
    for (const cloud of clouds) {
      const patch=cloud.userData.patch,pose=LetterfallEffects.smokePose(patch,age,game.effects.smoke,layout.width,layout.height,config.smoke,reducedMotion);
      cloud.visible=game.effects.smoke>0;
      cloud.material.uniforms.opacity.value=pose.opacity;
      cloud.material.uniforms.time.value=reducedMotion?0:pose.localAge;
      cloud.position.set(pose.x-layout.width/2,layout.height/2-pose.y,35);
      cloud.scale.set(pose.diameter*patch.aspect,pose.diameter/patch.aspect,1);
    }
    skyMaterial.uniforms.time.value = reducedMotion ? 0 : game.elapsed;
    renderer.setScissorTest(false); renderer.clear(); renderer.render(background, camera);
    renderer.clearDepth();
    renderer.render(scene,camera);
    ui.sync(game, view); ui.animate(now,dt,game);
    renderer.clearDepth(); renderer.render(ui.scene, camera);
  }
  return {
    canvas, render, ui,
    pickupEffect(tile) {
      // Match the last displayed frame for both pointer and keyboard input.
      const model=bodies.get(tile);
      return model ? pickupEffectFromYaw(model.group.rotation.y) : null;
    },
    get layout(){return layout;},
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      if (reducedMotion) clearTransfers();
      ui.setReducedMotion?.(reducedMotion);
    },
    hit(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x=(clientX-rect.left)/rect.width*layout.width,y=(clientY-rect.top)/rect.height*layout.height;
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const action = ui.hit(raycaster);
      if (action) return { action };
      if (ui.obscures(x,y))return null;
      const hits = raycaster.intersectObjects([...bodies.values()].map(model => model.group), true);
      for (const hit of hits) { let obj = hit.object; while (obj && !obj.userData.tile) obj = obj.parent; if (obj) return { tile: obj.userData.tile }; }
      return null;
    },
    burst(tile, { target = tile.kind === 'hourglass' ? 'timer' : 'tray', index = 0 } = {}) {
      const model = bodies.get(tile);
      if (!model) return;
      // The real tile is consumed immediately. This copy has no collision or
      // hit target, so feedback cannot delay input or intercept a second pick.
      if (!reducedMotion) {
        const group = model.group.clone(true), clonedMaterials = new Map();
        group.userData = {};
        group.traverse(object => {
          if (!object.isMesh) return;
          const source = object.material;
          if (!clonedMaterials.has(source)) {
            const material = source.clone();
            material.transparent = true; material.depthWrite = false;
            clonedMaterials.set(source, material);
          }
          object.material = clonedMaterials.get(source);
        });
        const requestedDuration = config.engagement?.selectionSeconds;
        const duration = Number.isFinite(requestedDuration) ? Math.min(.4, Math.max(.08, requestedDuration)) : .16;
        scene.add(group);
        transfers.push({ group, materials: [...clonedMaterials.values()], x: tile.x, y: tile.y,
          rotation: group.rotation.clone(), target, index: Math.max(0, Number(index) || 0), age: 0, duration });
        // Bound decorative copies independently of the game's available tiles.
        if (transfers.length > 8) removeTransfer(transfers.shift());
      }
      removeBody(tile, model);
    },
    releaseSmoke() {
      for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0;
      const patches = LetterfallEffects.smokePatches(layout.width,layout.height,config.smoke);
      for (const patch of patches) {
        const material=smoke.clone();material.uniforms.seed.value=patch.seed;
        const cloud = new THREE.Mesh(cloudGeometry,material);
        cloud.userData.patch=patch;
        cloud.rotation.z=patch.phase;cloud.renderOrder=10;
        scene.add(cloud);clouds.push(cloud);
      }
    },
    reset() { ui.reset();clearTransfers();for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0; },
  };
}
