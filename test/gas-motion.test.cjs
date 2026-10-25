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

test('a gas burst begins at a clamped picked tile while its remaining anchors stay dispersed in the playfield',()=>{
  const settings=createConfig().smoke;
  for(const [width,height] of [[320,568],[360,780],[900,640]]){
    for(const origin of [{x:width*.5,y:height*.5},{x:-100,y:-100},{x:width+100,y:height+100}]){
      const patches=smokePatches(width,height,settings,random(23),origin);
      assert.equal(patches.length,settings.patchCount);assert.equal(patches[0].delay,0);
      near(patches[0].x,Math.min(.86,Math.max(.14,origin.x/width)));
      near(patches[0].y,Math.min(.74,Math.max(.20,origin.y/height)));
      for(const patch of patches)assert.ok(patch.x>=.14&&patch.x<=.86&&patch.y>=.20&&patch.y<=.74);
      const short=Math.min(width,height);
      for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++)
        assert.ok(Math.hypot((patches[i].x-patches[j].x)*width/short,(patches[i].y-patches[j].y)*height/short)>.25);
    }
  }
  assert.deepEqual(smokePatches(360,640,settings,random(5),{x:NaN,y:0}),smokePatches(360,640,settings,random(5)), 'invalid origins retain ordinary randomized anchors');
});

test('gas blooms only to its existing size, drifts within five pixels, and erodes in place at the end',()=>{
  const settings=createConfig().smoke;
  for(const [width,height] of [[320,568],[420,900]])for(const patch of smokePatches(width,height,settings,random(19))){
    const diameter=Math.min(width,height)*patch.radius*2;
    const start=smokePose(patch,0,settings.durationSeconds,width,height,settings);
    near(start.diameter,diameter*.88);assert.equal(start.opacity,0);assert.equal(start.dissolve,0);
    let previousDiameter=0,previousDissolve=0;
    for(let tick=0;tick<=100;tick++){
      const age=settings.durationSeconds*tick/100,remaining=settings.durationSeconds-age;
      const pose=smokePose(patch,age,remaining,width,height,settings);
      assert.ok(pose.diameter>=previousDiameter&&pose.diameter<=diameter);previousDiameter=pose.diameter;
      assert.ok(pose.dissolve>=previousDissolve&&pose.dissolve<=1);previousDissolve=pose.dissolve;
      assert.ok(Math.hypot(pose.x-patch.x*width,pose.y-patch.y*height)<5);
      near(pose.opacity,smokeEnvelope(age,remaining,settings,patch.delay));
      const still=smokePose(patch,age,remaining,width,height,settings,true);
      near(still.diameter,diameter);near(still.x,patch.x*width);near(still.y,patch.y*height);
      near(still.opacity,pose.opacity);near(still.dissolve,pose.dissolve);
      if(age>1)near(pose.diameter,diameter);
    }
    const end=smokePose(patch,settings.durationSeconds,0,width,height,settings);
    assert.equal(end.opacity,0);assert.equal(end.dissolve,1);
  }
});

test('gas billows and dissolve remain frozen on pause and finish on active time',()=>{
  const game=new WordGame(dictionary);game.start(0);game.activate('smoke',0);
  const settings=game.config.smoke,patch=smokePatches(360,640,settings,random(8))[0];
  const pose=()=>smokePose(patch,settings.durationSeconds-game.effects.smoke,game.effects.smoke,360,640,settings);
  game.pause(2000);const frozen=pose();game.advance(100000);assert.deepEqual(pose(),frozen);
  game.resume(100000);game.advance(102400);
  near(pose().dissolve,.5);near(pose().opacity,.5);
  game.advance(103000);assert.equal(pose().opacity,0);assert.equal(pose().dissolve,1);
  assert.equal(game.activeEffect,null);
});
