const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
// Pin the algebra fixtures, so editing the game's live timing is not a rules regression.
const timing={nextLetterSeconds:2,extensionSecondsPerLetter:.5};
const create=(options={})=>{const game=new WordGame(['CAT','CATCH','CATS','DOG'],{...options,rules:{...timing,...options.rules}});game.start(0);return game;};
// Keep the established clock-integration fixtures at explicit five-second
// letter windows and slow-time effects. The configured two-second letter window
// and six-second ice duration have separate coverage below.
const createFiveSecondFixture=(options={})=>create({...options,rules:{nextLetterSeconds:5,...options.rules},hourglass:{durationSeconds:5,...options.hourglass}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('each accepted letter resets a configured two-second deadline, including blanks',()=>{
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

test('the word countdown follows slow time and integrates across effect expiry',()=>{
  const game=createFiveSecondFixture();game.activate('hourglass',0);game.select('C',0);
  assert.equal(game.advance(5000),null);near(game.letterSeconds,3);
  near(game.secondsUntilWordTimeout,3);assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(7999),null);
  assert.equal(game.advance(8000).reason,'timeout');near(game.remaining,53);
  near(game.elapsed,8);
  const ending=createFiveSecondFixture({timer:{startSeconds:6}});ending.select('C',0);
  const result=ending.advance(10000);assert.equal(result.ended,true);
  assert.equal(ending.phase,'over');near(ending.elapsed,5);assert.equal(ending.remaining,0);
  const clockFirst=createFiveSecondFixture({timer:{startSeconds:1}});clockFirst.select('C',0);
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
    const game=createFiveSecondFixture();for(const letter of word)game.select(letter,0);
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

test('a suppressed second hourglass cannot extend the slow word deadline',()=>{
  const game=createFiveSecondFixture();game.activate('hourglass',0);for(const l of 'CAT')game.select(l,0);
  game.advance(4000);near(game.letterSeconds,3.4);
  assert.equal(game.activate('hourglass',4000).type,'ignored');game.advance(5000);
  near(game.letterSeconds,3);assert.equal(game.current,'CAT');assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(7999),null);
  assert.equal(game.advance(8000).word,'CAT');near(game.remaining,55.5);
});

test('pause preserves both the hourglass and slowed letter countdown',()=>{
  const game=createFiveSecondFixture();game.activate('hourglass',0);game.select('C',0);game.pause(2000);
  near(game.letterSeconds,4.2);near(game.effects.hourglass,3);
  game.advance(100000);near(game.letterSeconds,4.2);game.resume(100000);game.advance(103000);
  near(game.letterSeconds,3);assert.equal(game.effects.hourglass,0);
  assert.equal(game.advance(106000).reason,'timeout');near(game.remaining,53);
});

test('slow time stretches a longer word window independently of combo expiry',()=>{
  const game=createFiveSecondFixture();
  for(const [i,word] of ['CAT','CATS','DOG'].entries()){
    for(const l of word)game.select(l,i*1000);game.submit(i*1000);
  }
  near(game.nextLetterWindow,5);game.activate('hourglass',3000);
  for(const l of 'CATCH')game.select(l,3000);
  near(game.letterSeconds,5.5);near(game.secondsUntilWordTimeout,8.5);
  assert.equal(game.advance(8000),null);near(game.letterSeconds,3.5);
  game.advance(10000);assert.equal(game.comboCount,0);near(game.letterSeconds,1.5);
  const result=game.advance(11500);
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


test('the fifth letter extends the window, and every further letter adds half a second',()=>{
  const game=new WordGame(['ELEPHANT'],{rules:timing});game.start(0);
  const durations=[2,2,2,2,2.5,3,3.5,4];
  let now=0;
  for(const [index,letter] of [...'ELEPHANT'].entries()){
    if(index)now+=durations[index-1]*1000-1;
    const result=game.select(letter,now);
    assert.equal(result.type,'letter');
    near(game.letterWindowSeconds,durations[index]);near(game.letterWindow,durations[index]);near(game.letterSeconds,durations[index]);
  }
  assert.equal(game.advance(now+3999),null);
  const result=game.advance(now+4000);
  assert.equal(result.type,'word');assert.equal(result.word,'ELEPHANT');assert.equal(result.automatic,true);
  assert.equal(game.wordCount,1);near(game.letterWindowSeconds,2);near(game.letterWindow,2);
  game.select('E',now+4000);near(game.letterSeconds,2);
});

test('a fifth letter at the old deadline cannot rescue an incomplete four-letter prefix',()=>{
  const game=create();for(const letter of 'CATC')game.select(letter,0);
  const result=game.select('H',2000);
  assert.equal(result.reason,'timeout');assert.equal(result.consumed,false);assert.equal(game.wordCount,0);
  assert.equal(game.current,'');near(game.remaining,56);
});

test('a long word keeps its extended window through pause and slow-time expiry',()=>{
  const game=new WordGame(['ELEPHANT'],{rules:timing});game.start(0);
  for(const letter of 'ELEPHANT')game.select(letter,0);
  game.activate('hourglass',0);game.pause(2000);
  near(game.letterSeconds,3.2);near(game.effects.hourglass,4);
  game.resume(100000);assert.equal(game.advance(104000),null);
  near(game.letterSeconds,1.6);assert.equal(game.effects.hourglass,0);near(game.letterWindow,4);
  assert.equal(game.advance(105599),null);assert.equal(game.advance(105600).word,'ELEPHANT');
  near(game.elapsed,7.6);
});

test('word-length extensions are configurable and validated',()=>{
  const game=create({rules:{nextLetterSeconds:1.5,extensionAfterLength:3,extensionSecondsPerLetter:.75}});
  for(const letter of 'CATCH')game.select(letter,0);
  near(game.letterWindowSeconds,3);assert.equal(game.advance(2999),null);assert.equal(game.advance(3000).word,'CATCH');
  for(const extensionAfterLength of [0,-1,1.5,NaN,Infinity])assert.throws(()=>createConfig({rules:{extensionAfterLength}}),/extensionAfterLength/);
  for(const extensionSecondsPerLetter of [-1,NaN,Infinity])assert.throws(()=>createConfig({rules:{extensionSecondsPerLetter}}),/extensionSecondsPerLetter/);
  const fixed=create({rules:{extensionSecondsPerLetter:0}});for(const letter of 'CATCH')fixed.select(letter,0);
  near(fixed.letterWindowSeconds,2);
});
