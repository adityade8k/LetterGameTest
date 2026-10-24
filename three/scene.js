import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { DESIGN } from './design.js';
import { celMaterial, atmosphereMaterial, smokeMaterial } from './materials.js';
import { createUI } from './ui.js';
import { createIcon } from './icons.js';
import { tileLayout, fitFaceObject } from './tile-layout.mjs';

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
  const background = new THREE.Scene(), scene = new THREE.Scene();
  const skyMaterial = atmosphereMaterial();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(360, 640), skyMaterial);
  sky.position.z = -25; background.add(sky);
  const materials = Object.fromEntries(['cream','plum','gold','mint'].map(key => [key, celMaterial(DESIGN.palette[key], {
    specularStrength:key==='plum'?0:DESIGN.tile.specularStrength,shininess:DESIGN.tile.shininess,
  })]));
  const geometry = roundedSquare(config.tiles.mobileSize);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const shadowGeometry = new THREE.PlaneGeometry(80, 80);
  const textCache = new Map();
  const bodies = new Map(), bursts = [], clouds = [];
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
      const icon = createIcon('hourglass',materials.plum,materials.gold); icon.scale.setScalar(1.05); icon.position.z = faceDepth+.8; front.add(icon);
    } else {
      // Separate typographic zones: badge row, letter, then point value.
      // Every glyph is fitted by its actual geometry, including wide W/M.
      front.add(placeFace(textMesh(tile.letter,25),face.letter));
      front.add(placeFace(textMesh(String(config.letterPoints[tile.letter]),5.5,.65),face.points));
      if(tile.bonus)front.add(placeFace(textMesh(`x${config.bonusLetters.timeMultiplier}`,6,.8),face.bonus));
      if(tile.grenade)front.add(placeFace(createIcon('grenade',materials.plum,materials.gold),face.grenade));
    }
    // Rotate a second face outward so its lettering reads normally from behind.
    // Cloning reuses the cached geometries and materials on both sides.
    const back = front.clone();
    back.rotation.y = Math.PI;
    group.add(front, back);
    group.userData.tile = tile;
    const halo = new THREE.Mesh(shadowGeometry, shadow); halo.position.z = -8; halo.renderOrder = -1;
    scene.add(halo, group);
    const model = { group, halo }; bodies.set(tile, model); return model;
  }
  const observer = new ResizeObserver(() => renderer.setSize(host.clientWidth, host.clientHeight, false));
  observer.observe(host);
  renderer.setSize(host.clientWidth, host.clientHeight, false);

  function render(tiles, game, dt, now, hover, view) {
    const visible = new Set(tiles);
    for (const [tile, model] of bodies) if (!visible.has(tile)) { scene.remove(model.group, model.halo); bodies.delete(tile); }
    for (const tile of tiles) {
      const model = bodies.get(tile) || build(tile);
      const previewFloat = game.phase === 'ready' && !reducedMotion ? Math.sin(now * .0008 + tile.x) * 3 : 0;
      model.group.position.set(tile.x - 180, 320 - DESIGN.fieldTop - tile.y + previewFloat, 0);
      // Apply local Y turns before the fixed face tilt and screen-plane angle.
      model.group.rotation.set(DESIGN.tile.tiltX+(tile.pitch||0), DESIGN.tile.tiltY+(tile.yaw||0), -tile.tilt, 'ZXY');
      // Hover lifts the tile, without growing its collision silhouette.
      if (tile === hover && game.phase === 'running') model.group.position.z = 1.5;
      model.halo.position.set(tile.x - 180 + 7, 320 - DESIGN.fieldTop - tile.y - 12 + previewFloat, -8);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i]; p.life -= game.phase === 'paused' ? 0 : dt;
      if (game.phase !== 'paused') p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(0, p.life) * 4);
      if (p.life <= 0) { scene.remove(p.mesh); bursts.splice(i, 1); }
    }
    const age = config.smoke.durationSeconds - game.effects.smoke;
    for (const cloud of clouds) {
      const patch=cloud.userData.patch,localAge=Math.max(0,age-patch.delay);
      cloud.visible=game.effects.smoke>0;
      cloud.material.uniforms.opacity.value=LetterfallEffects.smokeEnvelope(age,game.effects.smoke,config.smoke,patch.delay);
      cloud.material.uniforms.time.value=reducedMotion?0:localAge;
      const bloom=reducedMotion?1:.8+.2*(1-Math.exp(-localAge*5))+.025*localAge;
      const drift=reducedMotion?0:localAge*config.smoke.driftPixelsPerSecond;
      cloud.position.set(patch.x*360-180+Math.cos(patch.phase)*drift,320-DESIGN.fieldTop-patch.y*DESIGN.fieldHeight+Math.sin(patch.phase)*drift,35);
      cloud.scale.set(patch.diameter*bloom*patch.aspect,patch.diameter*bloom/patch.aspect,1);
    }
    skyMaterial.uniforms.time.value = reducedMotion ? 0 : game.elapsed;
    renderer.setScissorTest(false); renderer.clear(); renderer.render(background, camera);
    renderer.clearDepth();
    renderer.setScissor(0, host.clientHeight * (1 - (DESIGN.fieldTop + DESIGN.fieldHeight) / 640), host.clientWidth, host.clientHeight * DESIGN.fieldHeight / 640);
    renderer.setScissorTest(true); renderer.render(scene, camera); renderer.setScissorTest(false);
    ui.sync(game, view); ui.animate(now,dt,game);
    renderer.clearDepth(); renderer.render(ui.scene, camera);
  }
  return {
    canvas, render, ui,
    hit(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const y = (clientY - rect.top) / rect.height * 640;
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const action = ui.hit(raycaster);
      if (action) return { action };
      if (ui.blocking || y < DESIGN.fieldTop || y > DESIGN.fieldTop + DESIGN.fieldHeight) return null;
      const hits = raycaster.intersectObjects([...bodies.values()].map(model => model.group), true);
      for (const hit of hits) { let obj = hit.object; while (obj && !obj.userData.tile) obj = obj.parent; if (obj) return { tile: obj.userData.tile }; }
      return null;
    },
    burst(tile) {
      if (reducedMotion) return;
      for (let i = 0; i < 7; i++) {
        const mesh = new THREE.Mesh(sphere, materials[tile.bonus ? 'gold' : 'cream']);
        mesh.position.set(tile.x - 180, 320 - DESIGN.fieldTop - tile.y, 5);
        scene.add(mesh); bursts.push({ mesh, life: .5, velocity: new THREE.Vector3((Math.random()-.5)*95, 20+Math.random()*65, 0) });
      }
    },
    releaseSmoke() {
      for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0;
      const patches = LetterfallEffects.smokePatches(360, DESIGN.fieldHeight, config.smoke);
      for (const patch of patches) {
        const material=smoke.clone();material.uniforms.seed.value=patch.seed;
        const cloud = new THREE.Mesh(cloudGeometry,material);
        cloud.userData.patch={...patch,diameter:Math.min(360,DESIGN.fieldHeight)*patch.radius*2};
        cloud.rotation.z=patch.phase;cloud.renderOrder=10;
        scene.add(cloud);clouds.push(cloud);
      }
    },
    reset() { ui.reset();for (const p of bursts) scene.remove(p.mesh); bursts.length = 0; for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0; },
  };
}
