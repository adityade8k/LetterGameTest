import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { DESIGN } from './design.js';
import { celMaterial, gasTileMaterial, gasAuraMaterial, specialTileMaterial, atmosphereMaterial, iceTintMaterial, fireTintMaterial, stepThermalWave, createIceSnow, stepThermalParticles, iceSnowPose, iceSnowMaterial, createFireEmbers, fireEmberPose, fireEmberMaterial } from './materials.js';
import { createThermalUniforms, bindThermalMaterial, updateThermalUniforms } from './thermal-effect.js';
import { createSmokeAtlas, sampledSmokeMaterial } from './smoke-atlas.js';
import { fitSmokeCoverage } from './smoke-coverage.mjs';
import { createUI } from './ui.js';
import { tileLayout, fitFaceObject } from './tile-layout.mjs';
import { viewportLayout, fieldVeilBands } from './layout.mjs';
import { createLoadingScreen } from './loading-screen.js';

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
  const loading=createLoadingScreen(renderer,host,reducedMotion);
  const paintLoading=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
  await loading.ready;
  loading.setProgress(.15);
  let loadedAssets=0;
  const assetReady=value=>{loading.setProgress(.15+(++loadedAssets)*.15);return value;};
  const [font,uiFont,smokeSource] = await Promise.all([
    new FontLoader().loadAsync('vendor/three/helvetiker_bold.typeface.json').then(assetReady),
    new FontLoader().loadAsync('vendor/fonts/fredoka-semibold.typeface.json').then(assetReady),
    new THREE.TextureLoader().loadAsync('assets/smoke-haze-atlas.png').then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
      return texture;
    }).catch(()=>null).then(assetReady),
  ]);
  await paintLoading();
  const ui = createUI(uiFont, config, reducedMotion);
  loading.setProgress(.7);
  await paintLoading();
  const camera = new THREE.OrthographicCamera(-180, 180, 320, -320, .1, 100);
  camera.position.z = 60;
  let layout;
  const thermalUniforms=createThermalUniforms();
  const thermal=material=>bindThermalMaterial(material,thermalUniforms);
  const clonePlayfield=material=>thermal(material.clone());
  const background = new THREE.Scene(), scene = new THREE.Scene(), atmosphere = new THREE.Scene();
  const skyMaterial = thermal(atmosphereMaterial());
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(360, 640), skyMaterial);
  sky.position.z = -25; background.add(sky);
  const edgeScene=new THREE.Scene(),edgeMaterial=thermal(atmosphereMaterial({veil:true}));
  const edgeVeil=new THREE.Mesh(sky.geometry,edgeMaterial);edgeScene.add(edgeVeil);
  const taps=[],tapGeometry=new THREE.RingGeometry(5.2,6.8,24);
  const tapMaterial=new THREE.MeshBasicMaterial({color:DESIGN.palette.plum[0],transparent:true,opacity:.5,depthWrite:false,depthTest:false});
  const materials = Object.fromEntries(['cream','plum','mint','letterInk','smokeInk','iceInk','fireInk','goldInk'].map(key => [key, celMaterial(DESIGN.palette[key], {
    specularStrength:key==='plum'||key.endsWith('Ink')?0:DESIGN.tile.specularStrength,shininess:DESIGN.tile.shininess,
  })]));
  materials.ice=specialTileMaterial('ice',config.tiles.mobileSize);
  materials.smokeTile=gasTileMaterial();
  materials.fire=specialTileMaterial('fire',config.tiles.mobileSize);
  materials.gold=specialTileMaterial('gold',config.tiles.mobileSize);
  for(const material of Object.values(materials))thermal(material);
  const drawingSize=new THREE.Vector2();
  function climateLayer(effect,material,particles,particleMaterial,pose){
    const geometry=new THREE.BufferGeometry();
    const positions=new Float32Array(particles.length*3),alphas=new Float32Array(particles.length);
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('alpha',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size',new THREE.Float32BufferAttribute(particles.map(particle=>particle.size),1));
    const points=new THREE.Points(geometry,particleMaterial);
    points.frustumCulled=false;points.renderOrder=1;points.visible=false;atmosphere.add(points);
    return {effect,material,particles,particleMaterial,pose,geometry,positions,alphas,points,wave:{progress:0,opacity:0},clock:{time:0}};
  }
  const climateLayers=[
    climateLayer('hourglass',iceTintMaterial(),createIceSnow(),iceSnowMaterial(),iceSnowPose),
    climateLayer('fire',fireTintMaterial(),createFireEmbers(),fireEmberMaterial(),fireEmberPose),
  ];
  const geometry = roundedSquare(config.tiles.mobileSize);
  const gasAuraGeometry=new THREE.PlaneGeometry(config.tiles.mobileSize+24,config.tiles.mobileSize+24);
  const shadowGeometry = new THREE.PlaneGeometry(80, 80);
  const textCache = new Map();
  const bodies = new Map(), transfers = [], clouds = [];
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let smokeAtlas;
  try{smokeAtlas=createSmokeAtlas(renderer,smokeSource);}
  finally{smokeSource?.dispose();} // Only the compact baked atlas remains on the GPU.
  loading.setProgress(.85);
  await paintLoading();
  const cloudGeometry = new THREE.PlaneGeometry(1, 1);
  const shadow = thermal(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms:{shadowTone:{value:new THREE.Color(.40,.25,.30).convertSRGBToLinear()}},
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 shadowTone;void main(){float d=length((vUv-.5)*2.);gl_FragColor=vec4(shadowTone,(1.-smoothstep(.12,1.,d))*.21);\n#include <colorspace_fragment>\n}',
  }));

  function textMesh(text, size, depth = DESIGN.tile.letterDepth, ink='plum') {
    const key = `${text}:${size}:${depth}`;
    if (!textCache.has(key)) {
      const geo = new TextGeometry(text, { font, size, depth, curveSegments: 4, bevelEnabled: true, bevelThickness: .35, bevelSize: .25, bevelSegments: 1 });
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      geo.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, 0);
      textCache.set(key, geo);
    }
    return new THREE.Mesh(textCache.get(key), materials[ink]);
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
    const surface=tile.effect==='smoke'?'smokeTile':tile.effect==='hourglass'?'ice':tile.effect==='fire'?'fire':tile.bonus?'gold':'cream';
    const ink=tile.effect==='smoke'?'smokeInk':tile.effect==='hourglass'?'iceInk':tile.effect==='fire'?'fireInk':tile.bonus?'goldInk':'letterInk';
    const pulseMaterial=surface==='smokeTile'?clonePlayfield(materials.smokeTile):null;
    const body = new THREE.Mesh(geometry, pulseMaterial||materials[surface]);
    group.add(body);
    const front = new THREE.Group();
    {
      // Separate typographic zones: badge row, letter, then point value.
      // Every glyph is fitted by its actual geometry, including wide W/M.
      if(!tile.blank)front.add(placeFace(textMesh(tile.letter,25,DESIGN.tile.letterDepth,ink),face.letter));
      front.add(placeFace(textMesh(String(tile.blank?0:config.letterPoints[tile.letter]),5.5,.65,ink),face.points));
      if(tile.bonus)front.add(placeFace(textMesh(`x${config.bonusLetters.scoreMultiplier}`,6,.8,'goldInk'),face.bonus));
    }
    // Rotate a second face outward so its lettering reads normally from behind.
    // Cloning reuses the cached geometries and materials on both sides.
    {
      const back = front.clone();back.rotation.y = Math.PI;group.add(front, back);
    }
    group.userData.tile = tile;
    const halo = new THREE.Mesh(shadowGeometry, shadow); halo.position.z = -8; halo.renderOrder = -1;
    scene.add(halo, group);
    let aura=null;
    if(pulseMaterial){
      aura=new THREE.Mesh(gasAuraGeometry,thermal(gasAuraMaterial()));aura.renderOrder=-.5;
      // A sibling of the tile, deliberately absent from the raycast group.
      scene.add(aura);
    }
    const fades=new Map();
    if(tile.bornAt!==undefined)group.traverse(object=>{
      if(!object.isMesh)return;
      const source=object.material;
      if(!fades.has(source)){const material=clonePlayfield(source);material.transparent=true;material.depthWrite=false;fades.set(source,material);}
      object.material=fades.get(source);
    });
    const model = { group, halo, fades,pulseMaterial,aura,pulsePhase:pulseMaterial?Math.random()*Math.PI*2:0 }; bodies.set(tile, model); return model;
  }
  function removeBody(tile, model) {
    scene.remove(model.group, model.halo);
    if(model.aura){scene.remove(model.aura);model.aura.material.dispose();}
    model.pulseMaterial?.dispose();
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
    renderer.getDrawingBufferSize(drawingSize);
    thermalUniforms.thermalResolution.value.copy(drawingSize);
    for(const layer of climateLayers)layer.particleMaterial.uniforms.pointScale.value=drawingSize.y/layout.height;
    camera.left=-layout.width/2;camera.right=layout.width/2;camera.top=layout.height/2;camera.bottom=-layout.height/2;camera.updateProjectionMatrix();
    sky.scale.set(layout.width/360,layout.height/640,1);
    edgeVeil.scale.copy(sky.scale);edgeMaterial.uniforms.fieldHeight.value=layout.height;
    const bands=fieldVeilBands(layout);edgeMaterial.uniforms.veilBands.value.set(bands.topSolid,bands.topClear,bands.bottomClear,bands.bottomSolid);
    ui.resize(layout);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  loading.setProgress(.95);

  function render(tiles, game, dt, now, hover, view) {
    const reflectionTime=reducedMotion?0:(view.tutorial?.visualTime??game.elapsed);
    materials.ice.uniforms.time.value=reflectionTime;materials.fire.uniforms.time.value=reflectionTime;materials.gold.uniforms.time.value=reflectionTime;
    const visible = new Set(tiles);
    const gasBlocked=Object.values(game.effects).some(remaining=>remaining>0)||!['running','paused'].includes(game.phase);
    for (const [tile, model] of bodies) if (!visible.has(tile)) removeBody(tile, model);
    for (const tile of tiles) {
      const model = bodies.get(tile) || build(tile);
      // Practice letters enter from behind the coach card, never its header.
      model.group.visible=model.halo.visible=!view.tutorial||!tile.tutorialDecorative||tile.y>=layout.top+240;
      const previewFloat = game.phase === 'ready' && !reducedMotion ? Math.sin(now * .0008 + tile.x) * 3 : 0;
      model.group.position.set(tile.x-layout.width/2,layout.height/2-tile.y+previewFloat,0);
      // Render the same Y-only pose used by collisions and pickup-face selection.
      model.group.rotation.set(0,tile.yaw||0,0,'ZXY');
      // Hover lifts the tile, without growing its collision silhouette.
      if (tile === hover && game.phase === 'running') model.group.position.z = 1.5;
      model.halo.position.set(tile.x-layout.width/2+7,layout.height/2-tile.y-12+previewFloat,-8);
      const spawnOpacity=tile.bornAt===undefined?1:Math.min(1,Math.max(0,(game.elapsed-tile.bornAt)/config.falling.replacementFadeSeconds));
      const pulse=LetterfallEffects.gasPulse(reflectionTime,model.pulsePhase,{blocked:gasBlocked,reducedMotion});
      if(model.pulseMaterial){
        model.pulseMaterial.uniforms.pulse.value=pulse;
        model.aura.position.copy(model.group.position);model.aura.position.z=-4;
        model.aura.rotation.copy(model.group.rotation);
        model.aura.material.uniforms.opacity.value=pulse*.24*spawnOpacity;
        model.aura.visible=pulse>0;
      }
      if(model.fades.size){
        const opacity=spawnOpacity;
        for(const material of model.fades.values()){
          material.uniforms.opacity.value=opacity;
          if(material.uniforms.time)material.uniforms.time.value=reflectionTime;
          if(material.uniforms.pulse)material.uniforms.pulse.value=pulse;
        }
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
      for (const material of transfer.materials){
        material.uniforms.opacity.value = opacity;
        if(material.uniforms.time)material.uniforms.time.value=reflectionTime;
      }
    }
    const smokeSettings = game.config.smoke;
    const age = smokeSettings.durationSeconds - game.effects.smoke;
    for (const cloud of clouds) {
      const patch=cloud.userData.patch,pose=LetterfallEffects.smokePose(patch,age,game.effects.smoke,layout.width,layout.height,smokeSettings,reducedMotion);
      cloud.visible=game.effects.smoke>0;
      cloud.material.uniforms.opacity.value=pose.opacity;
      cloud.material.uniforms.time.value=reducedMotion?0:pose.localAge;
      cloud.material.uniforms.dissolve.value=pose.dissolve;
      cloud.position.set(pose.x-layout.width/2,layout.height/2-pose.y,35);
      cloud.scale.set(pose.width,pose.height,1);
    }
    for(let i=taps.length-1;i>=0;i--){
      const tap=taps[i];tap.age+=dt;
      if(tap.age>=.24){tap.mesh.removeFromParent();tap.mesh.material.dispose();taps.splice(i,1);continue;}
      const t=tap.age/.24;tap.mesh.scale.setScalar(reducedMotion?1:1+t*1.8);tap.mesh.material.opacity=(1-t)*.38;
    }
    skyMaterial.uniforms.time.value = edgeMaterial.uniforms.time.value = reducedMotion ? 0 : game.elapsed;
    for(const layer of climateLayers){
      const wave=layer.wave;
      stepThermalWave(wave,{active:game.effects[layer.effect]>0,paused:game.phase==='paused',reducedMotion,interrupted:Boolean(game.activeEffect&&game.activeEffect!==layer.effect),delta:dt});
      layer.points.visible=wave.opacity>0;
      stepThermalParticles(layer.clock,{visible:wave.opacity>0,paused:game.phase==='paused',reducedMotion,delta:dt});
      if(wave.opacity<=0)continue;
      for(let i=0;i<layer.particles.length;i++){
        const pose=layer.pose(layer.particles[i],{width:layout.width,height:layout.height,time:layer.clock.time,progress:wave.progress,opacity:wave.opacity});
        layer.positions[i*3]=pose.x-layout.width/2;layer.positions[i*3+1]=pose.y-layout.height/2;
        layer.alphas[i]=pose.alpha;
      }
      layer.geometry.attributes.position.needsUpdate=true;layer.geometry.attributes.alpha.needsUpdate=true;
    }
    // The playfield shaders apply the shared wave in place. No multisampled
    // offscreen color buffer, fullscreen copy, or per-activation allocation.
    const climate=climateLayers.find(layer=>layer.wave.opacity>0);
    updateThermalUniforms(thermalUniforms,climate);
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false); renderer.clear(); renderer.render(background, camera);
    renderer.clearDepth();
    renderer.render(scene,camera);
    if(game.phase!=='ready')renderer.render(edgeScene,camera);
    if(climate)renderer.render(atmosphere,camera);
    ui.sync(game, view, true); ui.animate(now,dt,game);
    renderer.clearDepth(); renderer.render(ui.scene, camera);
  }
  return {
    canvas, render, ui,
    async finishLoading(){
      await loading.finish();
      canvas.setAttribute('role','application');
      for(const name of ['aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'])canvas.removeAttribute(name);
    },
    failLoading:message=>loading.fail(message),
    tapFeedback(clientX,clientY){
      const rect=canvas.getBoundingClientRect();
      const x=(clientX-rect.left)/rect.width*layout.width-layout.width/2;
      const y=layout.height/2-(clientY-rect.top)/rect.height*layout.height;
      const mesh=new THREE.Mesh(tapGeometry,tapMaterial.clone());mesh.position.set(x,y,40);
      // Decorative only: the ripple never participates in raycasting.
      ui.scene.add(mesh);taps.push({mesh,age:0});
      if(taps.length>6){const oldest=taps.shift();oldest.mesh.removeFromParent();oldest.mesh.material.dispose();}
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
      const bands=fieldVeilBands(layout);
      if(ui.obscures(x,y)||y<=bands.topSolid||y>=bands.bottomSolid)return null;
      const hits = raycaster.intersectObjects([...bodies.values()].map(model => model.group), true);
      for (const hit of hits) { let obj = hit.object; while (obj && !obj.userData.tile) obj = obj.parent; if (obj) return { tile: obj.userData.tile }; }
      return null;
    },
    burst(tile, { target = 'tray', index = 0 } = {}) {
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
            const material = clonePlayfield(source);
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
    releaseSmoke(origin) {
      for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0;
      const patches = LetterfallEffects.smokePatches(layout.width,layout.height,config.smoke,Math.random,origin);
      const firstVariant=Math.floor(Math.random()*smokeAtlas.layout.count);
      for(let index=0;index<patches.length;index++)patches[index].variant=(firstVariant+index*5)%smokeAtlas.layout.count;
      const heightScale=fitSmokeCoverage(patches,smokeAtlas.alphaMasks,layout,fieldVeilBands(layout));
      for(const patch of patches)patch.height*=heightScale;
      for (let index=0;index<patches.length;index++) {
        const patch=patches[index];
        const material=sampledSmokeMaterial(smokeAtlas,patch.variant);material.uniforms.seed.value=patch.seed;
        const cloud = new THREE.Mesh(cloudGeometry,material);
        cloud.userData.patch=patch;
        cloud.renderOrder=10; // Wide banks stay horizontal as they enter from the sides.
        scene.add(cloud);clouds.push(cloud);
      }
    },
    // Retain the current climate mix: when the engine clears its effect, the next
    // frames dissolve it gently even if the round ended or was restarted.
    reset() { for(const tap of taps){tap.mesh.removeFromParent();tap.mesh.material.dispose();}taps.length=0;ui.reset();clearTransfers();for (const cloud of clouds) {scene.remove(cloud);cloud.material.dispose();} clouds.length = 0; },
  };
  }catch(error){
    await loading.fail('CLTTR could not load. Please refresh to try again.');
    throw error;
  }
}
