const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const {WordGame}=require('../engine.js');
const dictionary=require('../data/words.js');
const {gasPulse,smokePatches,smokePose,smokeEnvelope}=require('../effects.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
const random=initial=>{let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};

test('gas warnings breathe independently and stop while another timed effect or reduced motion is active',()=>{
  near(gasPulse(0,Math.PI/2),1);near(gasPulse(0,Math.PI*1.5),0);
  for(let age=0;age<20;age+=.05){
    const pulse=gasPulse(age,.7);assert.ok(pulse>=0&&pulse<=1);
    assert.ok(Math.abs(gasPulse(age+.05,.7)-pulse)<.09,'a warning breath cannot flash between frames');
    assert.equal(gasPulse(age,.7,{reducedMotion:true}),0);
    assert.equal(gasPulse(age,.7,{blocked:true}),0);
  }
  for(const effect of ['hourglass','smoke','fire']){
    const game=new WordGame(dictionary);game.start(0);game.activate(effect,0);
    assert.equal(gasPulse(game.elapsed,Math.PI/2,{blocked:Boolean(game.activeEffect)}),0);
  }
  const game=new WordGame(dictionary);game.start(0);game.pause(400);
  const frozen=gasPulse(game.elapsed,.7);game.advance(100000);
  assert.equal(gasPulse(game.elapsed,.7),frozen,'paused elapsed time preserves the warning pose');
  game.resume(100000);game.advance(100500);assert.notEqual(gasPulse(game.elapsed,.7),frozen);
});

test('gas uses staggered broad banks from both sides regardless of the picked tile',()=>{
  const settings=createConfig().smoke;
  for(const [width,height] of [[320,568],[360,780],[900,640]]){
    const patches=smokePatches(width,height,settings,random(23));
    assert.equal(patches.length,settings.patchCount);
    assert.equal(patches.filter(p=>p.side<0).length,2);
    assert.equal(patches.filter(p=>p.side>0).length,2);
    assert.equal(patches[0].delay,0);assert.equal(patches[1].delay,0);
    for(let index=1;index<patches.length;index++){
      assert.notEqual(patches[index].side,patches[index-1].side);
      assert.ok(patches[index].y-patches[index-1].y>.15,'banks must occupy different vertical bands');
    }
    for(const patch of patches){
      assert.ok(patch.width>=.95&&patch.width<=1.1,'each bank must span most of the field');
      assert.ok(patch.height>=.40&&patch.height<=.44);
      assert.ok(patch.x>.4&&patch.x<.6&&patch.y>.2&&patch.y<.85);
    }
    for(const origin of [{x:width*.5,y:height*.5},{x:-100,y:-100},{x:width+100,y:height+100},{x:NaN,y:0}]){
      assert.deepEqual(smokePatches(width,height,settings,random(23),origin),patches,'pickup location cannot relocate side-entry banks');
    }
  }
});

test('gas fades in from outside each side, settles without reversing, and dissolves in place',()=>{
  const settings=createConfig().smoke;
  for(const [width,height] of [[320,568],[420,900],[900,640]])for(const patch of smokePatches(width,height,settings,random(19))){
    const start=smokePose(patch,0,settings.durationSeconds,width,height,settings);
    assert.ok(patch.side<0?start.x+start.width/2<0:start.x-start.width/2>width,'the entire bank starts beyond its edge');
    assert.equal(start.opacity,0);assert.equal(start.dissolve,0);
    const arrived=smokePose(patch,settings.enterSeconds+patch.delay,settings.durationSeconds-settings.enterSeconds-patch.delay,width,height,settings);
    near(arrived.x,patch.x*width);near(arrived.y,patch.y*height);
    near(arrived.opacity,settings.opacity);
    const halfway=smokePose(patch,settings.enterSeconds*.5+patch.delay,settings.durationSeconds-settings.enterSeconds*.5-patch.delay,width,height,settings);
    assert.ok(halfway.opacity>0&&halfway.opacity<settings.opacity,'entry must be visible while still fading in');
    assert.ok(patch.side<0?halfway.x>start.x&&halfway.x<arrived.x:halfway.x<start.x&&halfway.x>arrived.x);
    let previous=start,previousDissolve=0;
    for(let tick=0;tick<=100;tick++){
      const age=settings.durationSeconds*tick/100,remaining=settings.durationSeconds-age;
      const pose=smokePose(patch,age,remaining,width,height,settings);
      assert.ok((pose.x-previous.x)*-patch.side>=-1e-8,'entry and gentle settling cannot reverse direction');
      assert.ok(Math.abs(pose.x-previous.x)<width*.09,'successive animation frames must remain continuous');
      assert.ok(pose.dissolve>=previousDissolve&&pose.dissolve<=1);previousDissolve=pose.dissolve;
      near(pose.opacity,smokeEnvelope(age,remaining,settings,patch.delay));
      near(pose.width,patch.width*width);near(pose.height,patch.height*height);
      if(age>=settings.enterSeconds+patch.delay)assert.ok(Math.hypot(pose.x-patch.x*width,pose.y-patch.y*height)<5,'settled banks only drift a few pixels');
      previous=pose;
    }
    const end=smokePose(patch,settings.durationSeconds,0,width,height,settings);
    assert.equal(end.opacity,0);assert.equal(end.dissolve,1);
  }
});

test('reduced-motion gas keeps its position and scale while retaining fades and coverage',()=>{
  const settings=createConfig().smoke;
  for(const patch of smokePatches(360,640,settings,random(9)))for(let tick=0;tick<=100;tick++){
    const age=settings.durationSeconds*tick/100,remaining=settings.durationSeconds-age;
    const moving=smokePose(patch,age,remaining,360,640,settings);
    const still=smokePose(patch,age,remaining,360,640,settings,true);
    near(still.x,patch.x*360);near(still.y,patch.y*640);
    near(still.width,moving.width);near(still.height,moving.height);
    near(still.opacity,moving.opacity);near(still.dissolve,moving.dissolve);
  }
});

test('gas entry and dissolve remain frozen on pause and finish on active time',()=>{
  for(const pauseMs of [350,2000]){
    const game=new WordGame(dictionary);game.start(0);game.activate('smoke',0);
    const settings=game.config.smoke,patch=smokePatches(360,640,settings,random(8))[0];
    const pose=()=>smokePose(patch,settings.durationSeconds-game.effects.smoke,game.effects.smoke,360,640,settings);
    game.pause(pauseMs);const frozen=pose();game.advance(100000);assert.deepEqual(pose(),frozen);
    game.resume(100000);game.advance(100000+4400-pauseMs);
    near(pose().dissolve,.5);near(pose().opacity,.5);
    game.advance(100000+5000-pauseMs);near(pose().opacity,0);near(pose().dissolve,1);
    assert.equal(game.activeEffect,null);
  }
});
