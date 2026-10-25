const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const make=(options={})=>{const game=new WordGame(['CAT','CATCH','DOG'],options);game.start(0);return game;};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const spell=(game,word,now=0,options={})=>[...word].forEach(letter=>game.select(letter,now,options));

test('fire doubles the clock for five real active seconds, then returns to normal',()=>{
  const game=make();
  assert.deepEqual(game.activate('fire',0),{type:'effect',effect:'fire',duration:5});
  assert.equal(game.timeScale,2);
  game.advance(2000);near(game.remaining,56);near(game.elapsed,2);near(game.effects.fire,3);
  game.advance(5000);near(game.remaining,50);near(game.effects.fire,0);assert.equal(game.timeScale,1);
  game.advance(6000);near(game.remaining,49);
});

test('fire letters halve the real letter deadline without changing its displayed budget or discard penalty',()=>{
  const game=make(),result=game.select('C',0,{effect:'fire',bonus:true});
  assert.deepEqual(result.tileEffect,{effect:'fire',duration:5});
  assert.equal(game.currentTiles[0].bonus,false);assert.equal(game.currentTiles[0].effect,'fire');
  near(game.letterWindow,2);near(game.secondsUntilWordTimeout,1);
  assert.equal(game.advance(999),null);near(game.letterSeconds,.002);
  const timeout=game.advance(1000);
  assert.equal(timeout.reason,'timeout');assert.equal(timeout.penalty,2);
  near(game.remaining,56);near(game.effects.fire,4);assert.equal(game.wordCount,0);
});

test('a delayed fire frame submits a valid word at its exact deadline and drains the rest of the frame',()=>{
  const game=make();game.select('C',0,{effect:'fire'});spell(game,'AT');
  const result=game.advance(2000);
  assert.equal(result.type,'word');assert.equal(result.automatic,true);assert.equal(result.word,'CAT');
  assert.equal(result.points,5);near(result.reward,.5);near(result.activeSeconds,1);
  near(game.remaining,56.5);near(game.elapsed,2);near(game.effects.fire,3);
  assert.equal(game.advance(2000),null);assert.equal(game.wordCount,1);
});

test('an automatic word survives a late fire frame that subsequently ends the round',()=>{
  const game=make({timer:{startSeconds:3}});game.activate('fire',0);spell(game,'CAT');
  const result=game.advance(10000);
  assert.equal(result.type,'word');assert.equal(result.ended,true);assert.equal(result.points,5);
  near(result.activeSeconds,1);near(game.elapsed,1.75);assert.equal(game.phase,'over');
  assert.deepEqual(game.effects,{hourglass:0,smoke:0,fire:0});
});

test('letter and round deadlines integrate correctly across fire expiry',()=>{
  const game=make({rules:{nextLetterSeconds:12}});game.activate('fire',0);game.select('C',0);
  near(game.secondsUntilWordTimeout,7);
  assert.equal(game.advance(6000),null);near(game.letterSeconds,1);near(game.remaining,49);assert.equal(game.timeScale,1);
  assert.equal(game.advance(7000).reason,'timeout');near(game.remaining,46);near(game.elapsed,7);
  for(const [startSeconds,expectedEnd] of [[3,1.5],[10,5],[12,7]]){
    const ending=make({timer:{startSeconds}});ending.activate('fire',0);
    assert.equal(ending.advance(10000).type,'ended');near(ending.elapsed,expectedEnd);
    assert.equal(ending.remaining,0);assert.deepEqual(ending.effects,{hourglass:0,smoke:0,fire:0});
  }
});

test('one long frame and many small frames agree through fire, automatic scoring and expiry',()=>{
  const run=step=>{
    const game=make();spell(game,'CAT');game.activate('fire',500);
    for(let now=500+step;now<8000;now+=step)game.advance(now);
    game.advance(8000);return game;
  };
  const large=run(7500),small=run(20);
  near(large.remaining,47.5);near(large.remaining,small.remaining);near(large.elapsed,small.elapsed);
  near(large.comboSeconds,small.comboSeconds);assert.deepEqual(large.words,['CAT']);assert.deepEqual(large.words,small.words);
  assert.deepEqual(large.effects,small.effects);assert.equal(large.timeScale,1);
});

test('the latest consumed ice or fire letter wins while smoke keeps its independent lifetime',()=>{
  const game=make();game.activate('smoke',0);game.select('C',0,{effect:'hourglass'});
  assert.equal(game.timeScale,.4);
  game.select('A',1000,{effect:'fire'});
  assert.equal(game.timeScale,2);near(game.effects.hourglass,0);near(game.effects.fire,5);near(game.effects.smoke,4);
  game.select('T',1500,{effect:'hourglass'});
  assert.equal(game.current,'CAT');assert.equal(game.timeScale,.4);near(game.effects.fire,0);
  near(game.effects.hourglass,7.5);near(game.effects.smoke,3.5);near(game.remaining,58.6);
  game.submit(1500);game.advance(5000);
  near(game.effects.smoke,0);near(game.effects.hourglass,4);near(game.effects.fire,0);
});

test('pausing freezes fire and smoke, refresh replaces the duration, and restart clears both',()=>{
  const game=make();game.activate('hourglass',0);game.activate('fire',0);game.activate('smoke',0);
  assert.equal(game.effects.hourglass,0);game.pause(2000);game.advance(100000);
  assert.equal(game.activate('hourglass',100000).type,'ignored');
  assert.deepEqual(game.effects,{hourglass:0,smoke:3,fire:3});near(game.remaining,56);
  game.resume(100000);game.advance(101000);game.activate('fire',101000);
  near(game.effects.fire,5);near(game.effects.smoke,2);assert.equal(game.timeScale,2);
  game.advance(106000);near(game.effects.fire,0);near(game.effects.smoke,0);near(game.remaining,44);
  game.activate('fire',106000);game.start(200000);
  assert.deepEqual(game.effects,{hourglass:0,smoke:0,fire:0});assert.equal(game.timeScale,1);near(game.remaining,60);
});

test('late or blank fire selections cannot replace ice, and consumed misspellings respect game over',()=>{
  const blank=make();blank.activate('hourglass',0);blank.select('?',0,{effect:'fire'});
  assert.equal(blank.effects.fire,0);assert.equal(blank.effects.hourglass,7.5);assert.equal(blank.currentTiles[0].effect,null);
  const late=make();late.activate('hourglass',0);spell(late,'CAT');
  const result=late.select('C',5000,{effect:'fire'});
  assert.equal(result.type,'word');assert.equal(result.consumed,false);assert.equal(result.tileEffect,undefined);
  assert.equal(late.effects.fire,0);near(late.effects.hourglass,2.5);
  const miss=make();assert.equal(miss.select('Z',0,{effect:'fire'}).tileEffect.effect,'fire');assert.equal(miss.timeScale,2);
  const ending=make({timer:{startSeconds:1}}),last=ending.select('Z',0,{effect:'fire'});
  assert.equal(last.ended,true);assert.equal(last.tileEffect,undefined);assert.equal(ending.effects.fire,0);
});

test('fire strength, duration and chance are configurable and validated',()=>{
  const game=make({fire:{timeScale:3,durationSeconds:2},letterEffects:{redChance:.1}});
  game.activate('fire',0);game.advance(3000);near(game.remaining,53);assert.equal(game.timeScale,1);
  for(const timeScale of [0,1,-1,NaN,Infinity])assert.throws(()=>createConfig({fire:{timeScale}}),/fire.timeScale/);
  for(const durationSeconds of [0,-1,NaN,Infinity])assert.throws(()=>createConfig({fire:{durationSeconds}}),/fire.durationSeconds/);
  for(const redChance of [-.1,NaN,Infinity,1])assert.throws(()=>createConfig({letterEffects:{redChance}}),/letterEffects/);
  assert.throws(()=>createConfig({letterEffects:{redChance:.7}}),/chances must total/);
});
