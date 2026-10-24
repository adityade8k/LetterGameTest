const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {registerHooks}=require('node:module');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
if(registerHooks)registerHooks({resolve(specifier,context,next){
  if(specifier==='three')specifier=pathToFileURL(path.resolve(__dirname,'../vendor/three/three.module.js')).href;
  return next(specifier,context);
}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);
const gameWithPickup=()=>{
  const game=new WordGame(['CATCH','CAT','DOG','SMILE','STARE'],{specialTiles:{warmupSeconds:0},hourglass:{spawnChance:1}},()=>0);
  game.start(0);for(const letter of 'CATCH')game.select(letter,0);game.submit(0);
  assert.equal(game.hourglassOffer,true);return game;
};

test('facing selects hourglass or smoke across full turns and rejects unreadable edges',async()=>{
  const {pickupEffectFromYaw:face}=await import('../three/pickup-facing.mjs');
  for(const turns of [-3,-1,0,1,3]){
    const offset=turns*2*Math.PI;
    assert.equal(face(offset),'hourglass');assert.equal(face(offset+Math.PI),'smoke');
    for(const edge of [Math.PI/2,Math.PI*1.5])for(const drift of [-.04,0,.04])assert.equal(face(offset+edge+drift),null);
    assert.equal(face(offset+Math.PI/2-.12),'hourglass');assert.equal(face(offset+Math.PI/2+.12),'smoke');
  }
  for(const angle of [undefined,NaN,Infinity])assert.equal(face(angle),null);
});

test('either pickup face consumes once, triggers only its own effect, and leaves the word intact',()=>{
  for(const effect of ['hourglass','smoke']){
    const game=gameWithPickup();game.select('C',500);
    const score=game.score,word=game.current;
    const result=game.collectPickup(effect,1000);
    assert.equal(result.type,'effect');assert.equal(result.effect,effect);assert.equal(result.consumed,true);
    assert.equal(game.effects[effect],5);assert.equal(game.effects[effect==='smoke'?'hourglass':'smoke'],0);
    assert.equal(game.hourglassOffer,false);assert.equal(game.current,word);assert.equal(game.score,score);
    near(game.letterSeconds,4);assert.equal(game.collectPickup(effect,1000).type,'ignored');
    game.advance(2000);near(game.remaining,effect==='hourglass'?58.6:58);
    game.pause(2000);const effects={...game.effects};game.advance(100000);assert.deepEqual(game.effects,effects);
    game.resume(100000);game.advance(104000);assert.equal(game.effects[effect],0);
  }
});

test('edge-on, absent, paused and late pickups cannot trigger effects or consume pending offers',()=>{
  const edge=gameWithPickup();assert.equal(edge.collectPickup(null,0).type,'ignored');assert.equal(edge.hourglassOffer,true);
  edge.pause(0);assert.equal(edge.collectPickup('smoke',0).type,'ignored');assert.equal(edge.hourglassOffer,true);
  for(const effect of ['hourglass','smoke'])for(const word of ['CAT','CA']){
    const game=gameWithPickup();for(const letter of word)game.select(letter,0);
    const result=game.collectPickup(effect,4500);
    assert.equal(result.type,word==='CAT'?'word':'penalty');assert.equal(result.consumed,false);
    assert.deepEqual(game.effects,{hourglass:0,smoke:0});assert.equal(game.hourglassOffer,true);
  }
  const late=gameWithPickup();assert.equal(late.collectPickup('smoke',61000).type,'ended');
  assert.deepEqual(late.effects,{hourglass:0,smoke:0});assert.equal(late.hourglassOffer,false);
  late.start(62000);assert.equal(late.collectPickup('smoke',62000).type,'ignored');
});

test('collecting another bomb refreshes smoke without extending slow time',()=>{
  const game=gameWithPickup();game.collectPickup('smoke',0);game.activate('hourglass',0);
  for(const [word,now] of [['SMILE',1000],['STARE',2000]]){
    for(const letter of word)game.select(letter,now);game.submit(now);
    assert.equal(game.hourglassOffer,true);assert.equal(game.collectPickup('smoke',now).effect,'smoke');
    near(game.effects.smoke,5);near(game.effects.hourglass,5-now/1000);
  }
});

test('pickups rotate continuously only around Y, faster than letters, with pause and scaled time',async()=>{
  const {prepareTile,stepTiles}=await import('../three/physics.mjs');
  const config=createConfig();
  const pickup=prepareTile({kind:'hourglass',x:180,y:100,tilt:.2,pitchOffset:.18,yawOffset:-.22},config,()=>.25);
  const options={width:360,size:47,speed:0,config,reducedMotion:true};
  const before={...pickup};stepTiles([pickup],0,options);assert.deepEqual(pickup,before);
  near(pickup.yaw,Math.PI/2);assert.ok(pickup.rotationSpeed>config.rotation.maxDegreesPerSecond*Math.PI/180);
  stepTiles([pickup],1,options);near(pickup.yaw,Math.PI/2+56*Math.PI/180);
  assert.equal(pickup.pitch,0);assert.equal(pickup.tilt,0);assert.equal(pickup.pitchOffset,0);assert.equal(pickup.yawOffset,0);
  const angle=pickup.yaw;stepTiles([pickup],config.hourglass.timeScale,options);
  near(pickup.yaw-angle,56*Math.PI/180*.4);
  stepTiles([pickup],6,options);near(pickup.yaw,(Math.PI/2+56*Math.PI/180*7.4)%(2*Math.PI));
});

test('rendered pickup symbols agree with the chosen camera-facing effect on both faces', {skip:!registerHooks}, async()=>{
  const [THREE,{createPickupFaces},{pickupEffectFromYaw}]=await Promise.all([import('../vendor/three/three.module.js'),import('../three/icons.js'),import('../three/pickup-facing.mjs')]);
  const material=new THREE.MeshBasicMaterial(),group=new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(47,47,17),material));
  group.add(createPickupFaces(material,material,9.05));
  for(const yaw of [0,.5,Math.PI,Math.PI+.5,-Math.PI]){
    group.rotation.y=yaw;group.updateMatrixWorld(true);const seen=new Set();
    for(let x=-20;x<=20;x+=2)for(let y=-20;y<=20;y+=2){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,100),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObject(group,true)[0];let object=hit?.object;
      while(object&&!object.userData.pickupEffect)object=object.parent;
      if(object)seen.add(object.userData.pickupEffect);
    }
    assert.deepEqual([...seen],[pickupEffectFromYaw(yaw)]);
  }
});
