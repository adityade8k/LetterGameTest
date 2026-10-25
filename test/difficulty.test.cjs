const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const {WordGame}=require('../engine.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);
const rng=(seed=7)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const modules=Promise.all([import('../three/difficulty.mjs'),import('../three/physics.mjs')]);

test('the first 45 active seconds smoothly ramp from zero to full without random fluctuations',async()=>{
  const [{DifficultyCurve}]=await modules;let rolls=0;
  const curve=new DifficultyCurve(createConfig().difficulty,()=>{rolls++;return .5;});
  assert.equal(curve.valueAt(0),0);near(curve.valueAt(22.5),.5);assert.equal(curve.valueAt(45),1);
  let previous=0;
  for(let time=0;time<=45;time+=.25){const value=curve.valueAt(time);assert.ok(value>=previous&&value<=1);previous=value;}
  assert.equal(rolls,0);assert.ok(curve.valueAt(.1)<.001);assert.ok(curve.valueAt(44.9)>.999);
});

test('random targets include full relief and renewed difficulty with smooth bounded transitions',async()=>{
  const [{DifficultyCurve}]=await modules;const rolls=[0,0,1,1];
  const curve=new DifficultyCurve(createConfig().difficulty,()=>rolls.shift()??.5);
  near(curve.valueAt(45),1);near(curve.valueAt(49),.5);near(curve.valueAt(53),0);
  near(curve.valueAt(61),.5);near(curve.valueAt(69),1);
  const long=new DifficultyCurve(createConfig().difficulty,rng(32));let previous=0,up=0,down=0;
  for(let t=0;t<3600;t+=.25){
    const level=long.valueAt(t);assert.ok(level>=0&&level<=1);
    assert.ok(Math.abs(level-previous)<.05,'intensity must not jump between frames');
    if(t>45){up+=level>previous;down+=level<previous;assert.ok(long.end-long.start>=8&&long.end-long.start<=16);}
    previous=level;
  }
  assert.ok(up>100&&down>100);
});

test('random schedule is independent of frame frequency and catches up after delayed frames',async()=>{
  const [{DifficultyCurve}]=await modules,settings=createConfig().difficulty;
  const fine=new DifficultyCurve(settings,rng(9)),coarse=new DifficultyCurve(settings,rng(9));
  for(let t=0;t<300;t+=1/60)fine.valueAt(t);
  near(fine.valueAt(300),coarse.valueAt(300));
  near(fine.end,coarse.end);near(fine.to,coarse.to);
  near(fine.valueAt(310),coarse.valueAt(310));
});

test('pause freezes active difficulty, hourglass keeps the active timeline, and restart resets it',async()=>{
  const [{DifficultyCurve}]=await modules;
  const game=new WordGame(['CAT']),curve=new DifficultyCurve(game.config.difficulty,rng(3));
  game.start(0);game.advance(20000);const before=curve.valueAt(game.elapsed);
  game.pause(20000);game.advance(100000);near(curve.valueAt(game.elapsed),before);
  game.resume(100000);game.advance(110000);near(game.elapsed,30);assert.ok(curve.valueAt(game.elapsed)>before);
  game.activate('hourglass',110000);const clock=game.remaining;game.advance(115000);
  near(game.elapsed,35);near(clock-game.remaining,2);assert.ok(curve.valueAt(game.elapsed)>before);
  game.start(120000);curve.reset();assert.equal(curve.valueAt(game.elapsed),0);
  const disabled=new DifficultyCurve(createConfig({difficulty:{enabled:false}}).difficulty,()=>{throw Error('no random choice needed');});
  assert.equal(disabled.valueAt(600),0);
});

test('Y phase stops at easy and increases smoothly beyond normal speed at hard peaks',async()=>{
  const [,physics]=await modules,config=createConfig();
  for(const letter of ['A','Q']){
    const make=()=>physics.prepareTile({kind:'letter',letter,x:180,y:100,tilt:.2},config,rng(9));
    const options={width:360,size:47,speed:0,config},initialPhase=make().spinPhase;
    const easy=make();physics.stepTiles([easy],3,{...options,difficultyLevel:0});assert.equal(easy.spinPhase,initialPhase);assert.equal(easy.pitch,0);assert.equal(easy.tilt,0);
    const low=make(),high=make();physics.stepTiles([low],1,{...options,difficultyLevel:.25});physics.stepTiles([high],1,{...options,difficultyLevel:.75});
    near(low.spinPhase-initialPhase,low.rotationSpeed*.25);near(high.spinPhase-initialPhase,high.rotationSpeed*.9375);
    assert.ok(Math.abs(high.spinPhase-initialPhase)>3*Math.abs(low.spinPhase-initialPhase));
    assert.ok(Math.abs(high.rotationSpeed)<=config.rotation.maxDegreesPerSecond*Math.PI/180);
    const angle=high.spinPhase;physics.stepTiles([high],2,{...options,difficultyLevel:0});near(high.spinPhase,angle);assert.equal(high.pitch,0);assert.equal(high.tilt,0);
    const reduced=make();physics.stepTiles([reduced],1,{...options,difficultyLevel:1,reducedMotion:true});near(reduced.spinPhase,initialPhase);
    const invalid=make();physics.stepTiles([invalid],1,{...options,difficultyLevel:NaN});near(invalid.spinPhase,initialPhase);
    const capped=make();physics.stepTiles([capped],1,{...options,difficultyLevel:9});near(capped.spinPhase-initialPhase,capped.rotationSpeed*config.difficulty.peakRotationMultiplier);
  }
});

test('hard rotation boost preserves the easy half and joins without speed jumps',async()=>{
  const [,{difficultyRotationFactor:factor}]=await modules;
  for(const level of [0,.1,.25,.5])near(factor(level,1.5),level);
  near(factor(.75,1.5),.9375);near(factor(1,1.5),1.5);
  near(factor(-1,1.5),0);near(factor(2,1.5),1.5);near(factor(NaN,1.5),0);
  // Both ends of the added boost have a flat slope, so crossing the hard
  // threshold or reaching the peak never introduces a sudden speed change.
  const epsilon=1e-5;
  assert.ok(Math.abs((factor(.5+epsilon,1.5)-factor(.5,1.5))/epsilon-1)<.0001);
  assert.ok(Math.abs((factor(1,1.5)-factor(1-epsilon,1.5))/epsilon-1.5)<.0001);
  let previous=0;
  for(let i=0;i<=100;i++){
    const level=i/100,value=factor(level,1.5);
    assert.ok(value>=previous&&value<=1.5);near(factor(level,1),level);
    previous=value;
  }
});

test('letter motion follows hourglass scale but pickup Y rotation is independent of difficulty',async()=>{
  const [,physics]=await modules,config=createConfig(),options={width:360,size:47,speed:0,config};
  const make=kind=>physics.prepareTile({kind,letter:'A',x:180,y:100,tilt:0},config,rng(2));
  const normal=make('letter'),slow=make('letter'),initialPhase=normal.spinPhase;
  physics.stepTiles([normal],1,{...options,difficultyLevel:1});physics.stepTiles([slow],.4,{...options,difficultyLevel:1});
  near(slow.spinPhase-initialPhase,.4*(normal.spinPhase-initialPhase));
  const easy=make('hourglass'),hard=make('hourglass'),yaw=easy.yaw;
  physics.stepTiles([easy],1,{...options,difficultyLevel:0});physics.stepTiles([hard],1,{...options,difficultyLevel:1});
  near(easy.yaw,hard.yaw);near(easy.yaw-yaw,56*Math.PI/180);assert.equal(hard.tilt,0);assert.equal(hard.pitch,0);
});

test('difficulty rejects invalid timing, reversed bounds and invalid target counts',()=>{
  for(const difficulty of [{enabled:1},{rampSeconds:0},{rampSeconds:NaN},{minTransitionSeconds:0},{maxTransitionSeconds:Infinity},{minTransitionSeconds:20,maxTransitionSeconds:10},{levelSteps:0},{levelSteps:1.5},{levelSteps:21},{peakRotationMultiplier:0},{peakRotationMultiplier:.99},{peakRotationMultiplier:NaN},{peakRotationMultiplier:Infinity}])assert.throws(()=>createConfig({difficulty}),/difficulty/);
});
