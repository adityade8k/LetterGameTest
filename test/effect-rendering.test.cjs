const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {registerHooks}=require('node:module');
if(registerHooks)registerHooks({resolve(specifier,context,next){
  if(specifier==='three')specifier=pathToFileURL(path.resolve(__dirname,'../vendor/three/three.module.js')).href;
  return next(specifier,context);
}});
const supported={skip:!registerHooks};

test('playfield copies share climate state while their fades remain independent and UI stays untouched',supported,async()=>{
  const [{createThermalUniforms,bindThermalMaterial,updateThermalUniforms},{celMaterial,iceTintMaterial,fireTintMaterial}]=await Promise.all([import('../three/thermal-effect.js'),import('../three/materials.js')]);
  const shared=createThermalUniforms(),source=celMaterial(['#fae7b5','#deb79b']),ui=source.clone();
  const vertex=source.vertexShader;
  bindThermalMaterial(source,shared);
  const fading=bindThermalMaterial(source.clone(),shared),selection=bindThermalMaterial(fading.clone(),shared);
  fading.uniforms.opacity.value=.4;selection.uniforms.opacity.value=.2;
  assert.equal(source.uniforms.opacity.value,1);assert.equal(fading.uniforms.opacity.value,.4);
  assert.equal(source.vertexShader,vertex,'thermal color cannot alter tile geometry or hits');
  assert.equal(ui.uniforms.thermalAmount,undefined,'unbound UI materials never inherit the effect');
  assert.equal(ui.userData.clttrThermal,undefined);
  for(const material of [source,fading,selection]){
    assert.equal(material.uniforms.thermalAmount,shared.thermalAmount);
    assert.equal(material.uniforms.thermalResolution,shared.thermalResolution);
    assert.equal(material.fragmentShader.split('vec3 clttrThermal(').length-1,1,'cloning never reapplies the color transform');
  }
  shared.thermalResolution.value.set(810,1440);
  assert.deepEqual(selection.uniforms.thermalResolution.value.toArray(),[810,1440]);
  const cold=iceTintMaterial(),hot=fireTintMaterial();
  updateThermalUniforms(shared,{material:cold,wave:{progress:.5,opacity:1}});
  assert.deepEqual(fading.uniforms.thermalAmount.value.toArray(),[.5,1,.92,0]);
  assert.equal(selection.uniforms.thermalTint.value,cold.uniforms.tint.value);
  updateThermalUniforms(shared,{material:hot,wave:{progress:.3,opacity:.75}});
  assert.deepEqual(fading.uniforms.thermalAmount.value.toArray(),[.3,.75,.86,1]);
  assert.equal(selection.uniforms.thermalTint.value,hot.uniforms.tint.value);
  updateThermalUniforms(shared,null);assert.equal(selection.uniforms.thermalAmount.value.y,0);
  assert.equal(fading.uniforms.opacity.value,.4,'ending the climate effect leaves spawn fade state alone');
  for(const material of [source,ui,fading,selection,cold,hot])material.dispose();
});

test('smoke atlas variants retain separate padded sampling areas at fixed physical resolution',supported,async()=>{
  const {smokeAtlasLayout}=await import('../three/smoke-atlas.js');
  const layout=smokeAtlasLayout();assert.equal(layout.count,16);
  assert.equal(layout.width,768);assert.equal(layout.height,768);
  const rects=Array.from({length:layout.count},(_,index)=>layout.rect(index));
  for(const rect of rects){
    assert.equal(rect.size,184);
    assert.ok(rect.x>=4&&rect.y>=4&&rect.x+rect.size<=layout.width-4&&rect.y+rect.size<=layout.height-4);
    assert.ok(rect.uv[0]>rect.x/layout.width&&rect.uv[1]>rect.y/layout.height);
    assert.ok(rect.uv[0]+rect.uv[2]<(rect.x+rect.size)/layout.width);
  }
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j];assert.ok(a.x+a.size<b.x||b.x+b.size<a.x||a.y+a.size<b.y||b.y+b.size<a.y);
  }
  for(let first=0;first<16;first++)assert.equal(new Set([0,1,2,3].map(index=>(first+index*5)%16)).size,4);
});

for(const useArt of [false,true])test(`smoke ${useArt?'art':'fallback'} bakes once and later clouds reuse its atlas`,supported,async()=>{
  const [THREE,{createSmokeAtlas,sampledSmokeMaterial}]=await Promise.all([import('three'),import('../three/smoke-atlas.js')]);
  const initialTarget={name:'previous'},initialColor=new THREE.Color('#af70a0');
  const state={target:initialTarget,color:initialColor.clone(),alpha:.7,scissor:true};
  const draws=[],compiled=[];let readbacks=0;
  const renderer={
    getRenderTarget:()=>state.target,getScissorTest:()=>state.scissor,
    getClearColor:out=>out.copy(state.color),getClearAlpha:()=>state.alpha,
    setRenderTarget:target=>{state.target=target;},setScissorTest:value=>{state.scissor=value;},
    setClearColor:(color,alpha)=>{state.color.set(color);state.alpha=alpha;},clear(){},
    readRenderTargetPixels(target,x,y,width,height,pixels){
      assert.equal(target,state.target);assert.equal(width,768);assert.equal(height,768);readbacks++;
      for(let index=3;index<pixels.length;index+=4)pixels[index]=255;
    },
    compile(scene){assert.equal(state.target,initialTarget,'warm the shader for the original display target');compiled.push(scene.children[0].material);},
    render(scene){
      const material=scene.children[0].material;
      draws.push({target:state.target,viewport:state.target.viewport.clone(),seed:material.uniforms.seed.value,
        opacity:material.uniforms.opacity.value,dissolve:material.uniforms.dissolve.value,time:material.uniforms.time.value,blending:material.blending,
        source:material.uniforms.source?.value,rect:material.uniforms.sourceRect?.value.toArray(),flip:material.uniforms.flip?.value.toArray()});
    },
  };
  const source=useArt?new THREE.Texture():null;
  const atlas=createSmokeAtlas(renderer,source);assert.equal(draws.length,16);
  if(useArt){
    for(let index=0;index<16;index++){
      assert.equal(draws[index].source,source);
      assert.deepEqual(draws[index].rect,[(index%2)*.5,Math.floor((index%4)/2)*.5,.5,.5]);
      assert.deepEqual(draws[index].flip,[index&4?-1:1,index&8?-1:1]);
    }
    assert.equal(new Set(draws.map(draw=>JSON.stringify([draw.rect,draw.flip]))).size,16);
    source.dispose(); // The retained atlas must not depend on the source after baking.
  }
  assert.equal(readbacks,1);assert.equal(atlas.alphaMasks.length,16);
  assert.ok(atlas.alphaMasks.every(mask=>mask.size===32&&mask.data.every(alpha=>alpha===255)));
  assert.equal(compiled.length,1,'the lightweight sampler program is also warmed before interaction');
  assert.equal(compiled[0].uniforms.atlas.value,atlas.texture);
  assert.equal(new Set(draws.map(draw=>draw.seed)).size,16);
  assert.equal(new Set(draws.map(draw=>draw.target)).size,1);
  assert.equal(draws[0].target.samples,0);assert.equal(draws[0].target.depthBuffer,false);
  for(const draw of draws){
    assert.equal(draw.viewport.z,184);assert.equal(draw.viewport.w,184);
    assert.equal(draw.opacity,1);assert.equal(draw.dissolve,0);assert.equal(draw.time,0);
    assert.equal(draw.blending,THREE.NoBlending,'baked edges retain unpremultiplied color for correct later fading');
  }
  assert.equal(state.target,initialTarget);assert.equal(state.scissor,true);assert.equal(state.alpha,.7);assert.ok(state.color.equals(initialColor));
  const clouds=Array.from({length:12},(_,index)=>sampledSmokeMaterial(atlas,index));
  for(const cloud of clouds)assert.equal(cloud.uniforms.atlas.value,atlas.texture);
  clouds[0].uniforms.opacity.value=.2;clouds[0].uniforms.dissolve.value=.6;
  assert.equal(clouds[1].uniforms.opacity.value,1);assert.equal(clouds[1].uniforms.dissolve.value,0);
  assert.equal(draws.length,16,'new bursts perform no shape render or framebuffer allocation');
  assert.equal(readbacks,1,'coverage guidance is read once during loading, not at pickup');
  assert.equal(atlas.texture.generateMipmaps,false,'atlas filtering cannot bleed neighboring variants');
  for(const cloud of clouds)cloud.dispose();atlas.dispose();
});


test('coverage guides preserve atlas cell boundaries and bottom-up alpha rows',supported,async()=>{
  const {smokeAtlasLayout,smokeAlphaMasks}=await import('../three/smoke-atlas.js');
  const layout=smokeAtlasLayout(4,24,2),pixels=new Uint8Array(layout.width*layout.height*4);
  for(let index=0;index<4;index++){
    const rect=layout.rect(index);
    for(let y=0;y<rect.size;y++)for(let x=0;x<rect.size;x++){
      pixels[((rect.y+y)*layout.width+rect.x+x)*4+3]=20+index*50+y;
    }
  }
  const masks=smokeAlphaMasks(pixels,layout,4);
  for(let index=0;index<4;index++){
    assert.deepEqual(Array.from(masks[index].data),[22,22,22,22,27,27,27,27,32,32,32,32,37,37,37,37].map(n=>n+index*50));
  }
});
