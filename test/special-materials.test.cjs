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

test('ice, fire and gold support isolated opacity and reflection uniforms for spawn and selection copies',supported,async()=>{
  const {specialTileMaterial}=await import('../three/materials.js');
  for(const kind of ['ice','fire','gold']){
    const material=specialTileMaterial(kind,52),copy=material.clone();
    assert.equal(material.uniforms.opacity.value,1);
    assert.equal(material.uniforms.time.value,0);
    assert.equal(material.uniforms.halfSize.value,26);
    assert.equal(material.transparent,false,'opaque faux glass avoids sorting artifacts while tiles turn');
    copy.uniforms.opacity.value=.25;copy.uniforms.time.value=3;
    assert.equal(material.uniforms.opacity.value,1);assert.equal(material.uniforms.time.value,0);
    assert.equal(copy.uniforms.opacity.value,.25);
    material.dispose();copy.dispose();
  }
  assert.throws(()=>specialTileMaterial('invalid'),/Unknown special material/);
});

test('fire shares the ice facets while keeping its gradient and reflections within saturated warm colors',supported,async()=>{
  const [{specialTileMaterial},{DESIGN}]=await Promise.all([import('../three/materials.js'),import('../three/design.js')]);
  const fire=specialTileMaterial('fire'),ice=specialTileMaterial('ice');
  const hex=uniform=>`#${uniform.value.getHexString()}`;
  assert.equal(hex(fire.uniforms.lightTone),DESIGN.palette.fire[0]);
  assert.equal(hex(fire.uniforms.midTone),DESIGN.palette.fire[1]);
  assert.equal(hex(fire.uniforms.shadeTone),DESIGN.palette.fireDeep);
  assert.equal(fire.uniforms.ice.value,ice.uniforms.ice.value,'fire keeps the same reflective facets and bright bevels');
  assert.equal(fire.uniforms.fire.value,1,'fire uses its broader red-to-yellow vertical gradient');
  assert.equal(ice.uniforms.fire.value,0,'ice retains its original diagonal gradient');
  assert.equal(fire.fragmentShader,ice.fragmentShader);
  const dark=fire.uniforms.shadeTone.value;
  assert.ok(dark.r>.5&&dark.r>dark.g*4,'the darkest surface stays red instead of black');
  const luminance=color=>.2126*color.r+.7152*color.g+.0722*color.b;
  const ink=dark.clone().set(DESIGN.palette.fireInk[0]);
  assert.ok((luminance(fire.uniforms.midTone.value)+.05)/(luminance(ink)+.05)>4.5,'brown lettering contrasts with the central orange face');
  fire.dispose();ice.dispose();
});

test('smoke matches its tile and the ice compositor uses a blue-to-white palette without depth occlusion',supported,async()=>{
  const [{smokeMaterial,iceTintMaterial},{DESIGN}]=await Promise.all([import('../three/materials.js'),import('../three/design.js')]);
  const smoke=smokeMaterial(),ice=iceTintMaterial();
  assert.equal(`#${smoke.uniforms.tint.value.getHexString()}`,DESIGN.palette.smokeTile[0]);
  assert.equal(`#${ice.uniforms.tint.value.getHexString()}`,DESIGN.palette.iceTint);
  assert.equal(`#${ice.uniforms.dark.value.getHexString()}`,DESIGN.palette.iceInk[0]);
  assert.equal(`#${ice.uniforms.light.value.getHexString()}`,DESIGN.palette.ice[0]);
  assert.equal(ice.depthTest,false);assert.equal(ice.depthWrite,false);assert.equal(ice.transparent,false);
  assert.equal(ice.uniforms.source.value,null,'the scene supplies an offscreen source only during ice');
  assert.equal(ice.uniforms.strength.value,.92);
  assert.equal(ice.uniforms.opacity.value,0);
  smoke.dispose();ice.dispose();
});

test('ice rises over 1.2 active seconds, freezes when paused, and refreshing it never restarts the wave',supported,async()=>{
  const {stepIceWave}=await import('../three/materials.js');
  const state={progress:0,opacity:0};
  stepIceWave(state,{active:true,delta:.3});
  assert.equal(state.progress,.25);assert.equal(state.opacity,1);
  stepIceWave(state,{active:true,paused:true,delta:10});
  assert.equal(state.progress,.25,'pause must not finish the reveal');
  stepIceWave(state,{active:true,delta:.3});
  assert.equal(state.progress,.5,'a refreshed pickup keeps its existing reveal');
  stepIceWave(state,{active:true,delta:.6});
  assert.equal(state.progress,1);
  stepIceWave(state,{active:true,delta:10});
  assert.equal(state.progress,1);
});

test('ice dissolves in half a second after expiry or an early reset, then the next pickup starts at the bottom',supported,async()=>{
  const {stepIceWave}=await import('../three/materials.js');
  const state={progress:.5,opacity:1};
  stepIceWave(state,{active:false,delta:.25});
  assert.equal(state.opacity,.5);assert.equal(state.progress,.5,'the covered area dissolves without sliding backwards');
  stepIceWave(state,{active:false,paused:true,delta:4});
  assert.equal(state.opacity,.5);
  stepIceWave(state,{active:false,delta:.25});
  assert.deepEqual(state,{progress:0,opacity:0});
  stepIceWave(state,{active:true,delta:.12});
  assert.ok(Math.abs(state.progress-.1)<1e-9);assert.equal(state.opacity,1);
});

test('reduced motion uses a static full-field ice palette and invalid frame deltas cannot move the wave',supported,async()=>{
  const {stepIceWave}=await import('../three/materials.js');
  const state={progress:0,opacity:0};
  stepIceWave(state,{active:true,reducedMotion:true,delta:0});
  assert.deepEqual(state,{progress:1,opacity:1});
  stepIceWave(state,{active:false,reducedMotion:true,delta:.5});
  assert.deepEqual(state,{progress:0,opacity:0});
  stepIceWave(state,{active:true,delta:-2});
  assert.deepEqual(state,{progress:0,opacity:1});
  stepIceWave(state,{active:true,delta:NaN});
  assert.deepEqual(state,{progress:0,opacity:1});
});

test('snow emerges only inside the spatial ice reveal and dissolves with its local frozen patch',supported,async()=>{
  const {iceSnowPose,iceWaveCoverage}=await import('../three/materials.js');
  const flake={x:0,y:.5,phase:0,drift:0,speed:0,opacity:.6};
  const field={width:360,height:640,time:0,progress:.5,opacity:1};
  assert.equal(iceSnowPose({...flake,y:.8},field).alpha,0,'no snow ahead of the wave');
  assert.equal(iceSnowPose({...flake,y:.2},field).alpha,.6,'settled frozen regions contain snow');
  const entering=iceSnowPose(flake,field).alpha;
  assert.ok(entering>0&&entering<.6,'the wave edge introduces flakes softly');
  assert.equal(iceSnowPose(flake,{...field,progress:1,opacity:.5}).alpha,.3);
  assert.equal(iceSnowPose(flake,{...field,progress:1,opacity:0}).alpha,0);
  for(let column=0;column<10;column++)for(let row=0;row<10;row++){
    const x=column/10,y=row/10;
    assert.equal(iceWaveCoverage(0,x,y),0);
    assert.equal(iceWaveCoverage(1,x,y),1);
    let last=0;
    for(let progress=0;progress<=1;progress+=.05){
      const coverage=iceWaveCoverage(progress,x,y);
      assert.ok(coverage>=last,'the reveal never travels backwards');last=coverage;
      if(coverage===0)assert.equal(iceSnowPose({...flake,x,y},{...field,progress}).alpha,0);
    }
  }
});

test('snow drifts only during visible active frames, remains static for pause and reduced motion, and resets after fade',supported,async()=>{
  const {stepIceSnow}=await import('../three/materials.js');
  const state={time:0};
  stepIceSnow(state,{visible:true,delta:.4});assert.equal(state.time,.4);
  stepIceSnow(state,{visible:true,paused:true,delta:10});assert.equal(state.time,.4);
  stepIceSnow(state,{visible:true,reducedMotion:true,delta:10});assert.equal(state.time,.4);
  stepIceSnow(state,{visible:true,delta:NaN});assert.equal(state.time,.4);
  stepIceSnow(state,{visible:true,delta:-2});assert.equal(state.time,.4);
  stepIceSnow(state,{visible:true,delta:.1});assert.equal(state.time,.5,'snow continues drifting gently during the ice dissolve');
  stepIceSnow(state,{visible:false,delta:.1});assert.equal(state.time,0);
});

test('snow remains within responsive playfields with slow physical drift and varied small flakes',supported,async()=>{
  const {createIceSnow,iceSnowPose}=await import('../three/materials.js');
  let seed=19;
  const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const flakes=createIceSnow(undefined,random);
  assert.equal(flakes.length,96);assert.ok(new Set(flakes.map(flake=>flake.size)).size>80);
  for(const flake of flakes){
    assert.ok(flake.size>=1.8&&flake.size<=4.6);assert.ok(flake.speed>=5&&flake.speed<=12);
    for(const [width,height] of [[320,568],[360,640],[420,900]])for(const time of [0,1,7.5,300]){
      const pose=iceSnowPose(flake,{width,height,time,progress:1,opacity:1});
      assert.ok(pose.x>=0&&pose.x<width);assert.ok(pose.y>=0&&pose.y<height);
    }
  }
  const steady={x:.5,y:.5,phase:0,drift:0,speed:8,opacity:.5};
  const before=iceSnowPose(steady,{width:360,height:640,time:0,progress:1,opacity:1});
  const after=iceSnowPose(steady,{width:360,height:640,time:1,progress:1,opacity:1});
  assert.ok(Math.abs(before.y-after.y-8)<1e-9,'flakes fall only eight logical pixels in a second');
});
