const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const words=['CAT','CATCH','CATS','DOG','DOGS','RAT','RATS','SUN','SUNS','HAT','HATS','MAT','MATS','HEN','HENS','TEN','TENS','NET','NETS','PET','PETS','PEN','PENS','COT'];
// These exact timeline fixtures use a two-second window independently of live tuning.
const create=(options={})=>{const game=new WordGame(words,{...options,rules:{nextLetterSeconds:2,extensionSecondsPerLetter:.5,...options.rules}},()=>0);game.start(0);return game;};
const spell=(game,word,now=0,options={})=>{for(const letter of word)game.select(letter,now,options);};
const complete=(game,word,now=0)=>{spell(game,word,now);return game.submit(now);};
const boost=game=>{for(const [i,word] of ['CAT','DOG','RAT'].entries())complete(game,word,i*1000);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('a valid word auto-submits once at the two-second deadline with its normal reward',()=>{
  const game=create();spell(game,'CAT');
  assert.equal(game.advance(1999),null);
  const result=game.advance(2000);
  assert.equal(result.type,'word');assert.equal(result.automatic,true);
  assert.equal(result.word,'CAT');assert.equal(result.points,5);near(result.reward,.5);
  near(game.remaining,58.5);near(result.activeSeconds,2);assert.equal(game.current,'');assert.equal(game.letterSeconds,0);
  assert.equal(game.score,5);assert.deepEqual(game.words,['CAT']);assert.equal(game.comboCount,1);
  assert.equal(game.advance(7000),null);assert.equal(game.score,5);near(game.remaining,53.5);
});

test('automatic submissions preserve blank and gold scoring, while a repeat is neutral',()=>{
  const game=create();
  game.select('C',0,{bonus:true});game.select('?',0);game.select('T',0);
  const first=game.advance(2000);
  assert.equal(first.word,'CAT');assert.equal(first.points,8);near(first.requestedReward,.4);
  spell(game,'CAT',3000);const repeat=game.advance(5000);
  assert.equal(repeat.type,'repeat');assert.equal(repeat.points,0);assert.equal(repeat.penalty,0);
  assert.equal(game.comboCount,1);near(game.comboSeconds,5);assert.equal(game.score,8);
  spell(game,'CATCH',5000);const longer=game.advance(7500);
  assert.equal(longer.points,12);near(longer.requestedReward,14.4);assert.equal(longer.hourglassOffered,false);assert.equal(game.hourglassOffer,false);
  assert.equal(game.collectedPoints('CAT'),8);assert.equal(game.score,20);
});

test('quick-word combos remain recorded but never alter the length-based letter deadline',()=>{
  const game=create();
  for(let i=0;i<words.length;i++){
    const result=complete(game,words[i],i*1000);
    assert.equal(result.type,'word');assert.equal(game.comboCount,i+1);
    near(game.letterWindowSeconds,2);near(result.letterWindow,2);
  }
  for(const letter of 'CATCH')game.select(letter,24000);
  near(game.letterSeconds,2.5);near(game.letterWindow,2.5);
});

test('manual and automatic words contribute to the same quick-word combo',()=>{
  const game=create();complete(game,'CAT',0);spell(game,'DOG',1000);
  assert.equal(game.advance(3000).automatic,true);
  complete(game,'RAT',4000);assert.equal(game.comboCount,3);near(game.letterWindowSeconds,2);
  spell(game,'SUN',5000);assert.equal(game.advance(6999),null);
  assert.equal(game.advance(7000).word,'SUN');assert.equal(game.comboCount,4);
});

test('an invalid timeout discards once, charges two seconds, and resets combo progress',()=>{
  const game=create();boost(game);spell(game,'CA',3000);
  const before=game.remaining,result=game.advance(5000);
  assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);
  near(game.remaining,before-4);assert.equal(game.comboCount,0);near(game.letterWindowSeconds,2);
  assert.equal(game.wordCount,3);assert.equal(game.current,'');
  assert.equal(game.advance(5001),null);complete(game,'SUN',5100);assert.equal(game.comboCount,1);
});

test('clear, incomplete submissions, and spelling failures reset a combo',()=>{
  for(const action of ['clear','incomplete','spelling']){
    const game=create();boost(game);
    if(action==='spelling')game.select('Q',3000);
    else{game.select('C',3000);action==='clear'?game.undo(3000):game.submit(3000);}
    assert.equal(game.comboCount,0);assert.equal(game.comboSeconds,0);near(game.letterWindowSeconds,2);
  }
});

test('repeats preserve the current combo but cannot refresh or increase it',()=>{
  const game=create();boost(game);
  const first=complete(game,'CAT',3000);assert.equal(first.type,'repeat');assert.equal(game.comboCount,3);near(game.comboSeconds,7);
  complete(game,'DOG',9000);assert.equal(game.comboCount,3);near(game.comboSeconds,1);
  game.advance(10000);assert.equal(game.comboCount,0);near(game.comboSeconds,0);
  complete(game,'RAT',10000);assert.equal(game.comboCount,0);near(game.comboSeconds,0);
});

test('eight seconds without a new completed word resets the combo at the boundary',()=>{
  const game=create();boost(game);game.advance(9999);
  assert.equal(game.comboCount,3);game.advance(10000);assert.equal(game.comboCount,0);
  complete(game,'SUN',10000);assert.equal(game.comboCount,1);
  const boundary=create();boost(boundary);spell(boundary,'SUN',8000);
  const result=boundary.advance(10000);
  assert.equal(result.type,'word');assert.equal(boundary.comboCount,1);near(boundary.letterWindowSeconds,2);
});

test('combo expiry does not change a granted long-word window',()=>{
  const game=create();boost(game);spell(game,'CATCH',9900);
  near(game.letterWindow,2.5);game.advance(10000);assert.equal(game.comboCount,0);
  near(game.letterSeconds,2.4);near(game.letterWindowSeconds,2.5);
  assert.equal(game.advance(12399),null);assert.equal(game.advance(12400).word,'CATCH');
});

test('pause freezes both timers; slow time does not lengthen combo expiry',()=>{
  const game=create();boost(game);game.select('C',2500);game.pause(3000);
  const letter=game.letterSeconds,combo=game.comboSeconds;
  game.advance(100000);near(game.letterSeconds,letter);near(game.comboSeconds,combo);
  game.resume(100000);game.advance(100500);
  near(game.letterSeconds,letter-.5);near(game.comboSeconds,combo-.5);
  const slow=create();boost(slow);slow.activate('hourglass',2000);slow.advance(10000);
  assert.equal(slow.comboCount,0);near(slow.letterWindowSeconds,2);
});

test('deadline input resolves a completed word without consuming the clicked tile or double scoring',()=>{
  for(const action of ['select','submit','undo','collectHourglass','pause']){
    const game=create();spell(game,'CAT');game.hourglassOffer=true;
    const result=action==='select'?game.select('C',2000,{effect:'smoke'}):game[action](2000);
    assert.equal(result.type,'word');assert.equal(result.automatic,true);assert.equal(game.score,5);
    assert.equal(game.current,'');assert.equal(game.effects.smoke,0);
    if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
    if(action==='pause')assert.equal(game.phase,'paused');
    assert.equal(game.submit(2000).type,'ignored');assert.equal(game.score,5);
  }
});

test('a delayed frame scores at the deadline even if the round subsequently ends',()=>{
  const game=create({timer:{startSeconds:6}});spell(game,'CAT');
  const result=game.advance(10000);
  assert.equal(result.type,'word');assert.equal(result.ended,true);assert.equal(result.hourglassOffered,false);
  assert.equal(game.score,5);near(game.elapsed,6.5);assert.equal(game.phase,'over');assert.equal(game.comboCount,0);
  const clockFirst=create({timer:{startSeconds:2}});spell(clockFirst,'CAT');
  assert.equal(clockFirst.advance(2000).type,'ended');assert.equal(clockFirst.score,0);
});

test('legacy combo tuning remains valid without overriding per-letter timing',()=>{
  const game=create({rules:{nextLetterSeconds:1.5},combo:{wordsToStart:2,maxGapSeconds:5,extraSecondsPerWord:.2,maxExtraSeconds:.3}});
  complete(game,'CAT');complete(game,'DOG',1000);near(game.letterWindowSeconds,1.5);
  complete(game,'RAT',2000);assert.equal(game.comboCount,3);near(game.letterWindowSeconds,1.5);
  game.start(3000);assert.equal(game.comboCount,0);near(game.letterWindow,1.5);
  const disabled=create({combo:{enabled:false}});boost(disabled);assert.equal(disabled.comboCount,0);near(disabled.letterWindowSeconds,2);
  for(const combo of [{enabled:1},{wordsToStart:0},{wordsToStart:2.5},{maxGapSeconds:0},{maxGapSeconds:Infinity},{extraSecondsPerWord:-1},{maxExtraSeconds:NaN}])assert.throws(()=>createConfig({combo}),/combo/);
});
