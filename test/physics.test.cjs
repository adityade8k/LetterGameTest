const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const physics=import('../three/physics.mjs');
const rng=(seed=7)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const tile=(api,config,x,y,letter='A',tilt=0,random=rng())=>api.prepareTile({kind:'letter',letter,x,y,tilt,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},config,random);

test('rotated tiles separate at contact and exchange a soft impulse',async()=>{
 const p=await physics,c=createConfig(),a=tile(p,c,150,100,'Q',.35),b=tile(p,c,177,128,'A',-.2);
 a.tilt=.35;b.tilt=-.2; // Exercise the general contact solver with explicit test poses.
 a.vx=12;a.vy=50;b.vx=-4;b.vy=29;
 p.settleTiles([a,b],360,47,c.physics);
 assert.equal(p.contact(a,b,47,1.9),null);
 assert.ok(a.vx<12);assert.ok(b.vx>-4);
 assert.ok(Math.abs(a.vx)<30&&Math.abs(b.vx)<30);
});
test('long crowded simulations keep rotated squares apart and inside side walls',async()=>{
 const p=await physics,c=createConfig(),random=rng(91);let tiles=[];
 for(let i=0;i<16;i++)tiles.push(tile(p,c,35+(i%5)*70,Math.floor(i/5)*66,'Q',(random()-.5)*1.2,random));
 p.settleTiles(tiles,360,47,c.physics);
 let worst=0;
 for(let frame=0;frame<1800;frame++){
  if(frame%26===0){const column=frame%5;const x=36+column*70;if(!tiles.some(t=>Math.abs(t.x-x)<55&&t.y<90)){const t=tile(p,c,x,-50,'Z',0,random);t.kind='hourglass';tiles.push(t);}}
  p.stepTiles(tiles,1/30,{width:360,size:47,speed:50,config:c,random,difficultyLevel:(1+Math.sin(frame/90))/2});tiles=tiles.filter(t=>t.y<410);
  for(let i=0;i<tiles.length;i++){
   const t=tiles[i],half=p.projectedHalfSize(t,47,c.physics.collisionGap);
   const edge=half.x*Math.abs(Math.cos(t.tilt))+half.y*Math.abs(Math.sin(t.tilt))+c.physics.wallPadding;
   assert.ok(Number.isFinite(t.x)&&Number.isFinite(t.y));assert.ok(t.x>=edge-1e-8&&t.x<=360-edge+1e-8);
   for(let j=i+1;j<tiles.length;j++){const hit=p.contact(tiles[i],tiles[j],47,0);if(hit)worst=Math.max(worst,hit.penetration);}
  }
 }
 assert.ok(worst<.05,`Visible overlap reached ${worst} logical pixels`);
});
test('physics substeps do not allow a fast two-sided pickup to pass through another',async()=>{
 const p=await physics,c=createConfig(),random=rng(33),a=tile(p,c,180,50,'Q',.2,random),b=tile(p,c,182,110,'E',-.1,random);a.kind='hourglass';a.rotationSpeed=c.hourglass.rotationDegreesPerSecond*Math.PI/180;
 for(let i=0;i<250;i++){
  p.stepTiles([a,b],.05,{width:360,size:47,speed:55,config:c,random});
  assert.equal(p.contact(a,b,47),null);
 }
});
test('zero dt freezes motion and zero rotation or reduced motion prevents turns',async()=>{
 const p=await physics,c=createConfig(),a=tile(p,c,180,100,'Q',.2);const before={...a};
 p.stepTiles([a],0,{width:360,size:47,speed:29,config:c});assert.deepEqual(a,before);
 p.stepTiles([a],2,{width:360,size:47,speed:29,config:c,reducedMotion:true});assert.equal(a.yaw,0);assert.equal(a.tilt,before.tilt);assert.equal(a.pitch,0);assert.ok(a.y>100);
 const off=createConfig({rotation:{minDegreesPerSecond:0,maxDegreesPerSecond:0}}),b=tile(p,off,180,100,'Q',.3);
 const stoppedTilt=b.tilt;p.stepTiles([b],3,{width:360,size:47,speed:29,config:off});assert.equal(b.yaw,0);assert.equal(b.tilt,stoppedTilt);assert.equal(b.pitch,0);
});
test('ordinary and high-value letters turn only around Z within their configured speeds',async()=>{
 const p=await physics,c=createConfig({rotation:{ordinarySpinChance:0,highValueSpinChance:1,minDegreesPerSecond:10,maxDegreesPerSecond:20}}),random=rng(8);
 const a=tile(p,c,80,100,'A',.3,random),q=tile(p,c,260,100,'Q',-.4,random);
 assert.ok(Math.abs(q.rotationSpeed)>=15*Math.PI/180&&Math.abs(q.rotationSpeed)<=20*Math.PI/180);
 const initialTilt=new Map([[a,a.tilt],[q,q.tilt]]);
 p.stepTiles([a,q],6,{width:360,size:47,speed:0,config:c,difficultyLevel:1});
 for(const t of [a,q]){
  assert.ok(Math.abs(t.tilt-initialTilt.get(t))>.7);assert.equal(t.pitch,0);assert.equal(t.yaw,0);
  assert.equal(t.pitchOffset,0);assert.equal(t.yawOffset,0);
  assert.ok(Math.abs(t.tilt-(initialTilt.get(t)+t.rotationSpeed*6)%(2*Math.PI))<1e-8);
 }
});
test('invalid physical tuning and turn probabilities are rejected',()=>{
 assert.throws(()=>createConfig({physics:{restitution:2}}));
 assert.throws(()=>createConfig({physics:{solverIterations:0}}));
 assert.throws(()=>createConfig({rotation:{highValueSpinChance:1.1}}));
 assert.throws(()=>createConfig({rotation:{secondaryAxisWeight:1.1}}));
 assert.throws(()=>createConfig({rotation:{restMinSeconds:4,restMaxSeconds:1}}));
});

test('letter, multiplier and score zones retain clear separation',async()=>{
 const {tileLayout}=await import('../three/tile-layout.mjs');
 for(const size of [35,47,58,72]){
  const zones=Object.values(tileLayout(size));
  for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){
   const a=zones[i],b=zones[j];
   const dx=Math.abs(a.x-b.x)-(a.w+b.w)/2,dy=Math.abs(a.y-b.y)-(a.h+b.h)/2;
   assert.ok(Math.max(dx,dy)>=2*size/47,`Zones ${i} and ${j} form a tangent at size ${size}`);
  }
 }
});
test('glyph fitting keeps narrow, wide and multi-character labels inside their zones',async()=>{
 const {tileLayout,fitFaceObject}=await import('../three/tile-layout.mjs');
 for(const zone of Object.values(tileLayout()))for(const width of [3,10,30,65]){
  const bounds={width,height:25,centerX:8,centerY:-2},fit=fitFaceObject(bounds,zone);
  assert.ok(width*fit.scale<=zone.w+1e-9);assert.ok(25*fit.scale<=zone.h+1e-9);
  assert.ok(Math.abs(fit.x+bounds.centerX*fit.scale-zone.x)<1e-9);
  assert.ok(Math.abs(fit.y+bounds.centerY*fit.scale-zone.y)<1e-9);
 }
});


test('Z-only letters keep the exact speed and front-facing pose across frames and difficulty changes',async()=>{
 const p=await physics,c=createConfig({rotation:{minDegreesPerSecond:20,maxDegreesPerSecond:20,randomDirection:false}});
 for(const letter of ['A','Q']){
  const t=tile(p,c,180,100,letter,.25);let expected=t.tilt;
  for(let frame=0;frame<600;frame++){
   const difficultyLevel=(1+Math.sin(frame/30))/2;
   p.stepTiles([t],1/60,{width:360,size:47,speed:0,config:c,difficultyLevel});
   expected+=20*Math.PI/180*difficultyLevel/60;
   assert.equal(t.pitch,0);assert.equal(t.yaw,0);
   assert.ok(Math.abs(t.tilt-expected%(2*Math.PI))<1e-8);
  }
 }
});
test('projected collision bounds contain all corners of thick tumbling tiles',async()=>{
 const p=await physics,random=rng(81);
 for(let i=0;i<100;i++){
  const t={pitch:random()*Math.PI*2,yaw:random()*Math.PI*2,halfDepth:13.1},bounds=p.projectedHalfSize(t,47);
  for(const x of [-23.5,23.5])for(const y of [-23.5,23.5])for(const z of [-13.1,13.1]){
   const px=x*Math.cos(t.yaw)+z*Math.sin(t.yaw);
   const py=x*Math.sin(t.pitch)*Math.sin(t.yaw)+y*Math.cos(t.pitch)-z*Math.sin(t.pitch)*Math.cos(t.yaw);
   assert.ok(Math.abs(px)<=bounds.x+1e-8&&Math.abs(py)<=bounds.y+1e-8);
  }
 }
});


test('letters born together have independent readable phases and never reset phase with difficulty',async()=>{
 const p=await physics,c=createConfig(),random=rng(42);
 const letters=Array.from({length:40},(_,i)=>tile(p,c,40+i*70,100,'A',0,random));
 const initial=letters.map(t=>t.tilt);
 assert.equal(new Set(initial.map(a=>a.toFixed(6))).size,40);
 assert.ok(letters.every(t=>Math.abs(Math.cos(t.tilt))>=.5-1e-9));
 assert.ok(new Set(letters.map(t=>t.rotationSpeed.toFixed(6))).size>30);
 assert.ok(letters.some(t=>t.rotationSpeed>0)&&letters.some(t=>t.rotationSpeed<0));
 const options={width:2900,size:47,speed:0,config:c};
 p.stepTiles(letters,1,{...options,difficultyLevel:0});assert.deepEqual(letters.map(t=>t.tilt),initial);
 p.stepTiles(letters,1,{...options,difficultyLevel:.6});
 for(const [i,t] of letters.entries()){
  assert.ok(Math.abs(t.tilt-initial[i]-t.rotationSpeed*.6)<1e-8);
  assert.equal(t.pitch,0);assert.equal(t.yaw,0);
 }
 const angles=letters.map(t=>t.tilt);
 p.stepTiles(letters,1,{...options,difficultyLevel:0});assert.deepEqual(letters.map(t=>t.tilt),angles);
});
