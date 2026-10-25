const test = require('node:test');
const assert = require('node:assert/strict');
const {WordGame} = require('../engine.js');
const {createConfig} = require('../config.js');
const tutorial = import('../three/tutorial.mjs');
const make = async(config={}) => new (await tutorial).TutorialSession(WordGame,config);
const spell = (session,word) => [...word].flatMap(letter=>session.pick(session.tiles.find(tile=>tile.letter===letter&&!tile.tutorialDecorative)));
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-8,`${actual} versus ${expected}`);
function toTimer(session) {
  spell(session,'CAT');session.advance(.8);session.act('submit');session.advance(.9);session.act('undo');session.advance(.9);
}
function toEffects(session) {
  toTimer(session);session.advance(3.9);spell(session,'PLANET');session.act('submit');session.advance(.9);
  spell(session,'GEM');session.act('submit');session.advance(1.4);
}
function activate(session) {return session.pick(session.tiles.find(tile=>tile.effect===session.step.effect));}
function finishEffect(session) {return session.advance(session.game.effects[session.step.effect]+.9);}

test('tutorial rejects out-of-order and stale taps, then advances automatically after feedback',async()=>{
  const session=await make(),[c,a,t]=session.tiles;
  assert.equal(session.state.expectedLetter,'C');assert.equal(session.state.targetTileId,c.id);
  assert.deepEqual(session.pick(t),[]);assert.deepEqual(session.act('tutorial-next'),[]);assert.equal(session.game.current,'');
  assert.equal(session.pick(c)[0].word,'C');assert.equal(session.state.expectedLetter,'A');
  assert.deepEqual(session.pick(c),[]);assert.deepEqual(session.pick({...a}),[]);
  assert.deepEqual(session.act('submit'),[]);assert.deepEqual(session.act('undo'),[]);
  session.pick(a);session.pick(t);
  assert.equal(session.game.current,'CAT');assert.equal(session.state.completed,true);assert.equal(session.state.canContinue,false);
  assert.equal(session.state.id,'tap');assert.equal(session.game.score,0);
  assert.deepEqual(session.pick(t),[]);assert.deepEqual(session.act('tutorial-next'),[]);
  assert.deepEqual(session.advance(.79),[]);assert.equal(session.state.id,'tap');
  assert.deepEqual(session.advance(.01),[{type:'tutorial-step',id:'submit'}]);
  assert.equal(session.state.target,'submit');assert.equal(session.game.current,'CAT');
});

test('reading never spends time or auto-submits a word, even across very late frames',async()=>{
  const session=await make();session.pick(session.tiles[0]);
  const remaining=session.game.remaining,letterSeconds=session.game.letterSeconds;
  session.advance(3600);
  assert.equal(session.game.remaining,remaining);assert.equal(session.game.letterSeconds,letterSeconds);assert.equal(session.game.current,'C');
  spell(session,'AT');session.advance(3600);session.advance(3600);
  assert.equal(session.state.id,'submit');assert.equal(session.game.current,'CAT');assert.equal(session.game.wordCount,0);
  assert.equal(session.game.phase,'running');assert.equal(session.state.canContinue,false);
  for(const dt of [0,-1,NaN,Infinity])assert.deepEqual(session.advance(dt),[]);
  assert.equal(session.game.remaining,remaining);
});

test('submit and clear use the actual rules once and gate the automatic next step',async()=>{
  const session=await make();spell(session,'CAT');session.advance(.8);
  assert.deepEqual(session.act('undo'),[]);
  const [word]=session.act('submit');assert.equal(word.type,'word');assert.equal(word.word,'CAT');assert.equal(word.points,5);
  assert.equal(session.game.score,5);assert.deepEqual(session.act('submit'),[]);
  assert.deepEqual(session.advance(.9),[{type:'tutorial-step',id:'clear'}]);
  assert.equal(session.game.current,'PL');assert.deepEqual(session.act('submit'),[]);
  const before=session.game.remaining,[clear]=session.act('undo');
  assert.equal(clear.reason,'clear');assert.equal(clear.penalty,session.game.config.penalties.clearWordSeconds);
  assert.equal(session.game.remaining,before-clear.penalty);assert.equal(session.game.current,'');
  assert.deepEqual(session.act('undo'),[]);assert.equal(session.state.canContinue,false);
  assert.deepEqual(session.advance(.9),[{type:'tutorial-step',id:'timer'}]);
});

test('timer demo crosses both warnings, holds its final reading, then introduces the longer word',async()=>{
  const session=await make();toTimer(session);const max=session.game.config.timer.maxSeconds;
  near(session.game.remaining/max,.65);assert.deepEqual(session.act('tutorial-next'),[]);
  session.advance(1.1);assert.ok(session.game.remaining/max<.5);assert.ok(session.game.remaining/max>.25);
  session.advance(1.7);assert.ok(session.game.remaining/max<.25);assert.equal(session.state.completed,false);
  session.advance(.2);near(session.game.remaining/max,.2);assert.equal(session.state.completed,true);
  session.advance(.89);near(session.game.remaining/max,.2);assert.equal(session.state.id,'timer');
  assert.deepEqual(session.advance(.01),[{type:'tutorial-step',id:'longer'}]);
  assert.equal(session.game.phase,'running');assert.equal(session.game.current,'');assert.equal(session.game.wordCount,1);
});

test('long and golden words use real rewards, with gold confirmed on scoring and given a longer celebration',async()=>{
  const session=await make();toTimer(session);session.advance(3.9);
  assert.equal(session.state.id,'longer');assert.deepEqual(session.act('submit'),[]);
  spell(session,'PLANET');assert.equal(session.state.target,'submit');assert.equal(session.state.completed,false);
  const before=session.game.remaining,[long]=session.act('submit');
  assert.equal(long.word,'PLANET');assert.equal(session.game.remaining,45);near(long.reward,45-before);
  session.advance(.9);assert.equal(session.state.id,'gold');
  const gold=session.tiles.find(tile=>tile.bonus),[pickup]=session.pick(gold);
  assert.equal(gold.letter,'G');assert.equal(pickup.goldCollected,true);assert.equal(pickup.type,'letter');
  assert.equal(session.state.completed,false);assert.deepEqual(session.act('submit'),[]);
  spell(session,'EM');const [scored]=session.act('submit');
  assert.equal(scored.word,'GEM');assert.equal(scored.scoreMultiplier,2);assert.equal(scored.points,12);
  assert.equal(session.state.completed,true);assert.match(session.state.detail,/Double Score/);
  session.advance(1.39);assert.equal(session.state.id,'gold');
  assert.deepEqual(session.advance(.01),[{type:'tutorial-step',id:'ice'}]);
});

test('only one special appears at a time and its full effect and release beat precede the next',async()=>{
  const session=await make();toEffects(session);
  for(const [id,effect,nextId] of [['ice','hourglass','fire'],['fire','fire','gas'],['gas','smoke','ready']]) {
    assert.equal(session.state.id,id);assert.equal(session.tiles.length,13);
    const specials=session.tiles.filter(tile=>tile.effect||tile.bonus);assert.equal(specials.length,1);
    const expected=specials[0],ordinary=session.tiles.find(tile=>!tile.effect);
    assert.equal(expected.effect,effect);assert.equal(session.state.targetTileId,expected.id);
    assert.deepEqual(session.pick(ordinary),[]);
    const [result]=session.pick(expected);assert.equal(result.tileEffect.effect,effect);assert.equal(session.game.activeEffect,effect);
    near(result.tileEffect.duration,createConfig()[effect].durationSeconds*.6);
    assert.equal(session.state.previewActive,true);assert.deepEqual(session.pick(ordinary),[]);
    assert.deepEqual(session.act('tutorial-next'),[]);session.advance(1.5);
    assert.equal(session.state.completed,true);assert.equal(session.state.canContinue,false);assert.equal(session.state.id,id);
    assert.equal(Object.values(session.game.effects).filter(value=>value>0).length,1);
    session.advance(session.game.effects[effect]);assert.equal(session.game.activeEffect,null);assert.equal(session.state.id,id);
    session.advance(.89);assert.equal(session.state.id,id);
    assert.deepEqual(session.advance(.01),[{type:'tutorial-step',id:nextId}]);assert.equal(session.game.activeEffect,null);
  }
  assert.equal(session.state.id,'ready');assert.equal(session.state.stepIndex,6);assert.equal(session.state.stepCount,7);
  assert.equal(session.state.canContinue,true);session.advance(1000);assert.equal(session.state.id,'ready');
  assert.deepEqual(session.act('tutorial-next'),[{type:'tutorial-complete'}]);assert.equal(session.finished,true);
  assert.deepEqual(session.act('tutorial-next'),[]);assert.deepEqual(session.act('submit'),[]);
});

test('special streams flow before activation, reuse their tiles and leave the target clear',async()=>{
  const session=await make();toEffects(session);
  const special=session.tiles.find(tile=>tile.effect),anchor={x:special.x,y:special.y};
  const stream=session.tiles.filter(tile=>tile.tutorialDecorative),ids=stream.map(tile=>tile.id),y=stream[0].y,remaining=session.game.remaining;
  assert.equal(stream.length,12);session.advance(2);assert.notEqual(stream[0].y,y);
  assert.deepEqual({x:special.x,y:special.y},anchor);near(session.game.remaining,remaining);
  for(let i=0;i<100;i++)session.advance(.1);
  assert.deepEqual(session.tiles.filter(tile=>tile.tutorialDecorative).map(tile=>tile.id),ids);
  assert.equal(session.state.id,'ice');assert.equal(session.game.activeEffect,null);
  for(const tile of stream) {
    assert.ok(tile.y>=session.motionBand.top&&tile.y<session.motionBand.bottom);
    assert.ok(Math.abs(tile.x-special.x)>session.game.config.tiles.mobileSize);
  }
});

test('special streams reflect each speed while effect previews preserve the round and letter clocks',async()=>{
  const speedByEffect={};
  for(const effect of ['hourglass','fire','smoke']) {
    const session=await make();toEffects(session);
    while(session.step.effect!==effect) {activate(session);finishEffect(session);}
    activate(session);
    const remaining=session.game.remaining,letterSeconds=session.game.letterSeconds,mistakes=session.game.mistakes,tile=session.tiles[0],distance=tile.previewDistance;
    session.advance(1);speedByEffect[effect]=tile.previewDistance-distance;
    session.advance(session.game.effects[effect]);
    assert.equal(session.game.remaining,remaining);assert.equal(session.game.letterSeconds,letterSeconds);
    assert.equal(session.game.current,'C');assert.equal(session.game.activeEffect,null);assert.equal(session.state.previewActive,false);
    assert.equal(session.game.mistakes,mistakes);assert.equal(session.game.phase,'running');
  }
  near(speedByEffect.hourglass,9.6);near(speedByEffect.fire,60);near(speedByEffect.smoke,24);
});

test('the same neutral stream continues smoothly across ice, fire and gas',async()=>{
  const session=await make();toEffects(session);
  const stream=session.tiles.filter(tile=>tile.tutorialDecorative);
  for(const nextId of ['fire','gas']) {
    activate(session);session.advance(session.game.effects[session.step.effect]);
    const distances=stream.map(tile=>tile.previewDistance);
    assert.deepEqual(session.advance(.9),[{type:'tutorial-step',id:nextId}]);
    const currentStream=session.tiles.filter(tile=>tile.tutorialDecorative);
    for(let index=0;index<stream.length;index++) {
      assert.equal(currentStream[index],stream[index]);
      near(currentStream[index].previewDistance,distances[index]+21.6);
      const {top,bottom}=session.motionBand;
      near(currentStream[index].y,top+(currentStream[index].baseY-top+distances[index]+21.6)%(bottom-top));
    }
  }
});

test('resizing preserves IDs and keeps interactive choices below the instruction card',async()=>{
  const session=await make();const ids=session.tiles.map(tile=>tile.id);
  for(const layout of [{width:360,height:640,top:0,bottom:0},{width:360,height:780,top:24,bottom:20}]) {
    session.resize(layout);assert.deepEqual(session.tiles.map(tile=>tile.id),ids);
    for(const tile of session.tiles) {
      assert.ok(tile.x>=48&&tile.x<=layout.width-48);assert.ok(tile.y>layout.top+300);
      assert.ok(tile.y<layout.height-layout.bottom-156);assert.equal(tile.yaw,0);
    }
  }
  session.resize(null);assert.deepEqual(session.tiles.map(tile=>tile.id),ids);
  toEffects(session);const anchor=session.tiles.find(tile=>tile.effect);assert.equal(anchor.x,180);
  assert.ok(anchor.y>324&&anchor.y<604);
});

test('reduced motion holds the stream still but still completes the tutorial effect',async()=>{
  const session=await make();toEffects(session);session.reducedMotion=true;
  const positions=session.tiles.map(tile=>({x:tile.x,y:tile.y}));session.advance(20);
  assert.deepEqual(session.tiles.map(tile=>({x:tile.x,y:tile.y})),positions);
  activate(session);const remainingPositions=session.tiles.map(tile=>({x:tile.x,y:tile.y}));session.advance(2);
  assert.deepEqual(session.tiles.map(tile=>({x:tile.x,y:tile.y})),remainingPositions);
  assert.equal(session.state.canContinue,false);near(session.game.effects.hourglass,session.game.config.hourglass.durationSeconds-2);
  session.advance(session.game.effects.hourglass);assert.equal(session.game.activeEffect,null);assert.equal(session.game.phase,'running');
  assert.deepEqual(session.tiles.map(tile=>({x:tile.x,y:tile.y})),remainingPositions);
  assert.deepEqual(session.advance(.9),[{type:'tutorial-step',id:'fire'}]);
});

test('practice state never leaks into live rounds or a fresh tutorial',async()=>{
  const config=createConfig(),before=JSON.stringify(config),live=new WordGame(['DOG'],config);
  live.start(0);live.select('D',0);const remaining=live.remaining;
  const session=await make(config);toEffects(session);activate(session);session.advance(1000);
  for(const effect of ['hourglass','fire','smoke']) {
    near(session.game.config[effect].durationSeconds,config[effect].durationSeconds*.6);
    assert.equal(live.config[effect].durationSeconds,config[effect].durationSeconds);
  }
  assert.equal(live.current,'D');assert.equal(live.remaining,remaining);assert.equal(live.wordCount,0);assert.equal(live.score,0);
  assert.equal(live.activeEffect,null);assert.equal(JSON.stringify(config),before);assert.notEqual(session.game,live);
  const fresh=await make(config);assert.equal(fresh.state.id,'tap');assert.equal(fresh.game.score,0);
  assert.equal(fresh.game.current,'');assert.equal(fresh.game.activeEffect,null);
  assert.deepEqual([...fresh.game.dictionary],['CAT','PLANET','GEM']);
});
