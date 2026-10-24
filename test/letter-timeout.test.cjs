const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const create=options=>{const game=new WordGame(['CAT','CATCH','CATS','DOG'],options);game.start(0);return game;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('each accepted letter resets a two-second deadline, including blanks',()=>{
  const game=create();game.select('C',1000);game.advance(2999);
  assert.equal(game.current,'C');near(game.letterSeconds,.001);
  game.select('?',2999);near(game.letterSeconds,2);
  game.select('T',4998);game.select('C',4998);near(game.letterSeconds,2);
  assert.equal(game.advance(6997),null);
  const result=game.advance(6998);
  assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);
  assert.equal(game.current,'');assert.equal(game.letterSeconds,0);
  assert.deepEqual(game.currentTiles,[]);assert.deepEqual(game.currentPrefixes,['']);
  near(game.remaining,51.002);assert.equal(game.score,0);assert.equal(game.wordCount,0);
  game.advance(10000);near(game.remaining,48); // Never charges a second discard.
});

test('submitting before the deadline cancels it without altering word rewards',()=>{
  const game=create();for(const l of 'CAT')game.select(l,0);
  assert.equal(game.submit(1999).points,5);assert.equal(game.letterSeconds,0);
  game.advance(6000);near(game.remaining,54.5);assert.deepEqual(game.words,['CAT']);
});

test('late input cannot submit unfinished expired words or consume an unselected tile',()=>{
  for(const action of ['submit','select','undo','collectHourglass']){
    const game=create();for(const l of 'CA')game.select(l,0);game.hourglassOffer=true;
    const result=action==='select'?game.select('C',2000,{grenade:true}):game[action](2000);
    assert.equal(result.reason,'timeout');assert.equal(game.current,'');near(game.remaining,56);
    assert.equal(game.score,0);assert.equal(game.effects.smoke,0);
    if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
  }
});

test('pause freezes the letter deadline, and a pause at expiry still pauses',()=>{
  const game=create();game.select('C',0);game.pause(750);game.advance(100000);
  near(game.letterSeconds,1.25);game.resume(100000);game.advance(101249);
  assert.equal(game.current,'C');assert.equal(game.advance(101250).reason,'timeout');
  near(game.remaining,56);
  const other=create();other.select('C',0);
  assert.equal(other.pause(2000).reason,'timeout');assert.equal(other.phase,'paused');
});

test('the deadline uses active real seconds during slow time and integrates long frames',()=>{
  const game=create();game.activate('hourglass',0);game.select('C',0);
  assert.equal(game.advance(6000).reason,'timeout');near(game.remaining,55);
  near(game.elapsed,6);assert.equal(game.effects.hourglass,0);
  const ending=create({timer:{startSeconds:3}});ending.select('C',0);
  const result=ending.advance(10000);assert.equal(result.ended,true);
  assert.equal(ending.phase,'over');near(ending.elapsed,2);assert.equal(ending.remaining,0);
  const clockFirst=create({timer:{startSeconds:1}});clockFirst.select('C',0);
  assert.equal(clockFirst.advance(10000).type,'ended');near(clockFirst.elapsed,1);
});

test('timeout duration and discard penalty are configurable and reset cleanly',()=>{
  const game=create({rules:{nextLetterSeconds:3},penalties:{clearWordSeconds:1.25}});
  game.select('C',0);assert.equal(game.advance(2999),null);
  assert.equal(game.advance(3000).penalty,1.25);near(game.remaining,55.75);
  game.select('C',3000);game.undo(3001);assert.equal(game.letterSeconds,0);
  game.select('C',3002);game.start(4000);assert.equal(game.letterSeconds,0);
  assert.equal(game.advance(10000),null);assert.equal(game.remaining,54);
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>createConfig({rules:{nextLetterSeconds:value}}),/nextLetterSeconds/);
});
