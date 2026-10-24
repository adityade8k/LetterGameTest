const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const create=options=>{const game=new WordGame(['CAT','CATCH','CATS','DOG'],options);game.start(0);return game;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('each accepted letter resets a five-second deadline, including blanks',()=>{
  const game=create();game.select('C',1000);game.advance(5999);
  assert.equal(game.current,'C');near(game.letterSeconds,.001);
  game.select('?',5999);near(game.letterSeconds,5);
  game.select('T',10998);game.select('C',10998);near(game.letterSeconds,5);
  assert.equal(game.advance(15997),null);
  const result=game.advance(15998);
  assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);
  assert.equal(game.current,'');assert.equal(game.letterSeconds,0);
  assert.deepEqual(game.currentTiles,[]);assert.deepEqual(game.currentPrefixes,['']);
  near(game.remaining,42.002);assert.equal(game.score,0);assert.equal(game.wordCount,0);
  game.advance(20000);near(game.remaining,38); // Never charges a second discard.
});

test('submitting before the deadline cancels it without altering word rewards',()=>{
  const game=create();for(const l of 'CAT')game.select(l,0);
  assert.equal(game.submit(1999).points,5);assert.equal(game.letterSeconds,0);
  game.advance(6000);near(game.remaining,54.5);assert.deepEqual(game.words,['CAT']);
});

test('late input cannot submit unfinished expired words or consume an unselected tile',()=>{
  for(const action of ['submit','select','undo','collectHourglass']){
    const game=create();for(const l of 'CA')game.select(l,0);game.hourglassOffer=true;
    const result=action==='select'?game.select('C',5000,{grenade:true}):game[action](5000);
    assert.equal(result.reason,'timeout');assert.equal(game.current,'');near(game.remaining,53);
    assert.equal(game.score,0);assert.equal(game.effects.smoke,0);
    if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
  }
});

test('pause freezes the letter deadline, and a pause at expiry still pauses',()=>{
  const game=create();game.select('C',0);game.pause(750);game.advance(100000);
  near(game.letterSeconds,4.25);game.resume(100000);game.advance(104249);
  assert.equal(game.current,'C');assert.equal(game.advance(104250).reason,'timeout');
  near(game.remaining,53);
  const other=create();other.select('C',0);
  assert.equal(other.pause(5000).reason,'timeout');assert.equal(other.phase,'paused');
});

test('the word countdown follows slow time and integrates across effect expiry',()=>{
  const game=create();game.activate('hourglass',0);game.select('C',0);
  assert.equal(game.advance(5000),null);near(game.letterSeconds,3);
  near(game.secondsUntilWordTimeout,3);assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(7999),null);
  assert.equal(game.advance(8000).reason,'timeout');near(game.remaining,53);
  near(game.elapsed,8);
  const ending=create({timer:{startSeconds:6}});ending.select('C',0);
  const result=ending.advance(10000);assert.equal(result.ended,true);
  assert.equal(ending.phase,'over');near(ending.elapsed,5);assert.equal(ending.remaining,0);
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

test('catching an hourglass mid-word stretches the remaining window without resetting it',()=>{
  for(const word of ['C','CAT']){
    const game=create();for(const letter of word)game.select(letter,0);
    game.advance(4000);near(game.letterSeconds,1);game.hourglassOffer=true;
    assert.equal(game.collectHourglass(4000).effect,'hourglass');near(game.letterSeconds,1);
    near(game.secondsUntilWordTimeout,2.5);
    assert.equal(game.advance(6000),null);near(game.letterSeconds,.2);
    const result=game.advance(6500);
    assert.equal(result.type,word==='CAT'?'word':'penalty');
    assert.equal(game.current,'');near(game.effects.hourglass,2.5);
    if(word==='CAT'){assert.equal(result.automatic,true);assert.equal(result.points,5);near(game.remaining,55.5);}
    else{assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);near(game.remaining,53);}
  }
});

test('a refreshed hourglass extends slow word formation while keeping the five-second budget',()=>{
  const game=create();game.activate('hourglass',0);for(const l of 'CAT')game.select(l,0);
  game.advance(4000);near(game.letterSeconds,3.4);
  game.activate('hourglass',4000);game.advance(9000);
  near(game.letterSeconds,1.4);assert.equal(game.current,'CAT');assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(10399),null);
  assert.equal(game.advance(10400).word,'CAT');near(game.remaining,55.5);
});

test('pause preserves both the hourglass and slowed letter countdown',()=>{
  const game=create();game.activate('hourglass',0);game.select('C',0);game.pause(2000);
  near(game.letterSeconds,4.2);near(game.effects.hourglass,3);
  game.advance(100000);near(game.letterSeconds,4.2);game.resume(100000);game.advance(103000);
  near(game.letterSeconds,3);assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(106000).reason,'timeout');near(game.remaining,53);
});

test('slow time also stretches a combo window and honors it across combo expiry',()=>{
  const game=create();
  for(const [i,word] of ['CAT','CATS','DOG'].entries()){
    for(const l of word)game.select(l,i*1000);game.submit(i*1000);
  }
  near(game.nextLetterWindow,5.25);game.activate('hourglass',3000);
  for(const l of 'CATCH')game.select(l,3000);
  near(game.letterSeconds,5.25);near(game.secondsUntilWordTimeout,8.25);
  assert.equal(game.advance(8000),null);near(game.letterSeconds,3.25);
  game.advance(10000);assert.equal(game.comboCount,0);near(game.letterSeconds,1.25);
  const result=game.advance(11250);
  assert.equal(result.word,'CATCH');assert.equal(result.points,12);assert.equal(game.comboCount,1);
  near(game.nextLetterWindow,5);
});

test('one long frame and small frames resolve slow word formation at the same time',()=>{
  function run(step){
    const game=create();for(const l of 'CAT')game.select(l,0);
    game.activate('hourglass',1000);
    for(let now=1000+step;now<11000;now+=step)game.advance(now);
    game.advance(11000);return game;
  }
  const large=run(10000),small=run(20);
  near(large.remaining,small.remaining);near(large.comboSeconds,small.comboSeconds);
  near(large.elapsed,small.elapsed);assert.deepEqual(large.words,small.words);
  assert.equal(large.score,5);assert.equal(large.current,'');assert.equal(small.current,'');
  assert.equal(large.effects.hourglass,0);assert.equal(small.effects.hourglass,0);
});
