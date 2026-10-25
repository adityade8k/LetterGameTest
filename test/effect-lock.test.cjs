const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const effects=['hourglass','smoke','fire'];
const empty={hourglass:0,smoke:0,fire:0};
const make=options=>{const game=new WordGame(['CAT','CATS','DOG'],options);game.start(0);return game;};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const attempt=(game,route,effect,now)=>{
  if(route==='select')return game.select('C',now,{effect});
  if(route==='collectPickup'){game.hourglassOffer=true;return game.collectPickup(effect,now);}
  if(route==='applyEffect'){game.advance(now);return game.applyEffect(effect);}
  return game.activate(effect,now);
};

test('every active timed effect blocks every same or different effect through every activation route',()=>{
  for(const active of effects)for(const blocked of effects)for(const route of ['activate','select','collectPickup','applyEffect']){
    const game=make(),duration=game.config[active].durationSeconds;
    game.activate(active,0);
    const result=attempt(game,route,blocked,500);
    if(route==='applyEffect')assert.equal(result,0);
    else if(route==='select'){
      assert.equal(result.type,'letter');assert.equal(result.tileEffect,undefined);
      assert.equal(game.current,'C');assert.equal(game.currentTiles[0].effect,blocked);
    }else assert.equal(result.type,'ignored');
    if(route==='collectPickup')assert.equal(game.hourglassOffer,false,'a blocked legacy pickup is never held for later');
    assert.equal(game.activeEffect,active);near(game.effects[active],duration-.5);
    for(const other of effects.filter(effect=>effect!==active))assert.equal(game.effects[other],0);
    near(game.remaining,60-.5*game.timeScale);
    if(route==='select'){
      game.select('A',500);game.select('T',500);
      assert.equal(game.submit(500).points,5,'a suppressed special still scores as a normal letter');
    }
    game.advance((duration+1)*1000);
    assert.deepEqual(game.effects,empty);assert.equal(game.activeEffect,null,'blocked effects are not queued');
  }
});

test('the first accepted pickup at exact expiry may start any timed effect through every route',()=>{
  for(const active of effects)for(const next of effects)for(const route of ['activate','select','collectPickup','applyEffect']){
    const game=make(),expires=game.config[active].durationSeconds*1000;
    game.activate(active,0);game.advance(expires-1);
    assert.equal(game.activeEffect,active);
    const result=attempt(game,route,next,expires),duration=game.config[next].durationSeconds;
    if(route==='applyEffect')assert.equal(result,duration);
    else if(route==='select')assert.deepEqual(result.tileEffect,{effect:next,duration});
    else{assert.equal(result.type,'effect');assert.equal(result.effect,next);assert.equal(result.duration,duration);}
    assert.equal(game.activeEffect,next);near(game.effects[next],duration);
    for(const other of effects.filter(effect=>effect!==next))assert.equal(game.effects[other],0);
  }
});

test('small frame rounding cannot leave a timed-effect lock past the exact expiry',()=>{
  for(const effect of effects){
    const game=make(),expires=game.config[effect].durationSeconds*1000;
    game.activate(effect,0);
    for(let now=20;now<expires;now+=20)game.advance(now);
    const result=game.select('C',expires,{effect});
    assert.equal(result.tileEffect.effect,effect);near(game.effects[effect],game.config[effect].durationSeconds);
  }
});

test('gold still activates and doubles normal word points while any timed effect is active',()=>{
  for(const active of effects){
    const game=make();game.activate(active,0);
    const gold=game.select('C',500,{bonus:true});
    assert.equal(gold.goldCollected,true);assert.equal(gold.tileEffect,undefined);
    game.select('A',500);game.select('T',500,{bonus:true});
    const word=game.submit(500);
    assert.equal(word.points,10);assert.equal(word.scoreMultiplier,2);near(word.requestedReward,.5);
    assert.equal(game.activeEffect,active);near(game.effects[active],game.config[active].durationSeconds-.5);
  }
});

test('pause preserves the lock and all direct effect routes reject non-running states',()=>{
  for(const active of effects){
    const game=make();game.activate(active,0);game.pause(500);
    const frozen={...game.effects};
    for(const effect of effects){
      assert.equal(game.applyEffect(effect),0);
      assert.equal(game.activate(effect,100000).type,'ignored');
      assert.equal(game.select('C',100000,{effect}).type,'ignored');
      game.hourglassOffer=true;assert.equal(game.collectPickup(effect,100000).type,'ignored');
    }
    assert.deepEqual(game.effects,frozen);
    game.resume(100000);game.advance(100000+(game.config[active].durationSeconds-.5)*1000);
    assert.deepEqual(game.effects,empty);
    game.start(200000);assert.deepEqual(game.effects,empty);assert.equal(game.activeEffect,null);
    assert.equal(game.select('C',200000,{effect:'smoke'}).tileEffect.effect,'smoke');
  }
  for(const phase of ['ready','over']){
    const game=make();game.phase=phase;
    for(const effect of effects)assert.equal(game.applyEffect(effect),0);
    assert.deepEqual(game.effects,empty);
  }
  const invalid=make();assert.equal(invalid.applyEffect('gold'),0);assert.deepEqual(invalid.effects,empty);
});

test('late automatic submissions take priority over pickups even when the effect expires on that deadline',()=>{
  for(const route of ['activate','select','collectPickup']){
    const game=make({rules:{nextLetterSeconds:5}});game.activate('smoke',0);
    for(const letter of 'CAT')game.select(letter,0);
    const result=attempt(game,route,'fire',5000);
    assert.equal(result.type,'word');assert.equal(result.automatic,true);assert.equal(result.points,5);
    assert.equal(result.tileEffect,undefined);assert.deepEqual(game.effects,empty);
    if(route!=='activate')assert.equal(result.consumed,false);
    assert.equal(game.select('C',5000,{effect:'fire'}).tileEffect.effect,'fire');
  }
});

test('a misspelling may consume the letter without activating its blocked effect, including a fatal penalty',()=>{
  for(const active of effects){
    const game=make();game.activate(active,0);
    const result=game.select('Z',500,{effect:active});
    assert.equal(result.reason,'spelling');assert.equal(result.tileEffect,undefined);
    near(game.effects[active],game.config[active].durationSeconds-.5);
    const ending=make({timer:{startSeconds:2}});ending.activate(active,0);
    const last=ending.select('Z',0,{effect:'smoke'});
    assert.equal(last.ended,true);assert.equal(last.tileEffect,undefined);
    assert.deepEqual(ending.effects,empty);assert.equal(ending.applyEffect('fire'),0);
  }
});

test('an expired round rejects pickup attempts and reset removes all earlier locks',()=>{
  for(const route of ['activate','select','collectPickup']){
    const game=make({timer:{startSeconds:1}});game.activate('fire',0);
    const result=attempt(game,route,'hourglass',1000);
    assert.equal(result.type,'ended');assert.equal(result.tileEffect,undefined);
    assert.deepEqual(game.effects,empty);assert.equal(game.phase,'over');
    game.start(2000);assert.equal(game.activate('hourglass',2000).type,'effect');
  }
});
