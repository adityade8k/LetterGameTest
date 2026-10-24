const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const words=['CAT','CATCH','CATS','DOG','DOGS','RAT','RATS','SUN','SUNS','HAT','HATS','MAT','MATS'];
const create=options=>{const game=new WordGame(words,options,()=>0);game.start(0);return game;};
const spell=(game,word,now=0,options={})=>{for(const letter of word)game.select(letter,now,options);};
const complete=(game,word,now=0)=>{spell(game,word,now);return game.submit(now);};
const boost=game=>{for(const [i,word] of ['CAT','DOG','RAT'].entries())complete(game,word,i*1000);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('a valid word auto-submits once with its normal points and time',()=>{
  const game=create();spell(game,'CAT');
  assert.equal(game.advance(1999),null);
  const result=game.advance(2000);
  assert.equal(result.type,'word');assert.equal(result.automatic,true);
  assert.equal(result.word,'CAT');assert.equal(result.points,5);near(result.reward,.5);
  near(game.remaining,58.5);assert.equal(game.current,'');assert.equal(game.letterSeconds,0);
  assert.equal(game.score,5);assert.deepEqual(game.words,['CAT']);assert.equal(game.comboCount,1);
  assert.equal(game.advance(4000),null);assert.equal(game.score,5);near(game.remaining,56.5);
});

test('automatic submissions preserve blank scoring, gold rewards, repeats, and hourglass drops',()=>{
  const game=create({specialTiles:{warmupSeconds:0},hourglass:{spawnChance:1}});
  game.select('C',0,{bonus:true});game.select('?',0);game.select('T',0);
  const first=game.advance(2000);
  assert.equal(first.word,'CAT');assert.equal(first.points,4);near(first.requestedReward,.7);
  spell(game,'CAT',2000);const repeat=game.advance(4000);
  assert.equal(repeat.reason,'repeat');assert.equal(repeat.penalty,2);assert.equal(game.comboCount,0);assert.equal(game.score,4);
  spell(game,'CATCH',4000);const longer=game.advance(6000);
  assert.equal(longer.points,12);assert.equal(longer.hourglassOffered,true);assert.equal(game.hourglassOffer,true);
  assert.equal(game.collectedPoints('CAT'),4);assert.equal(game.score,16);
});

test('third quick word unlocks the boost; further words grow it only to the cap',()=>{
  const game=create();const expected=[2,2,2.25,2.5,2.75,3,3,3,3];
  for(let i=0;i<expected.length;i++){
    const result=complete(game,words[i],i*1000);
    assert.equal(result.type,'word');assert.equal(game.comboCount,i+1);
    near(game.nextLetterWindow,expected[i]);assert.equal(result.letterWindow,expected[i]);
  }
  game.select('M',9000);near(game.letterSeconds,3);near(game.letterWindow,3);
  game.select('A',11999);near(game.letterSeconds,3);assert.equal(game.current,'MA');
});

test('manual and automatic words contribute to the same quick-word combo',()=>{
  const game=create();complete(game,'CAT',0);spell(game,'DOG',1000);
  assert.equal(game.advance(3000).automatic,true);
  complete(game,'RAT',4000);assert.equal(game.comboCount,3);near(game.nextLetterWindow,2.25);
  spell(game,'SUN',5000);assert.equal(game.advance(7249),null);
  assert.equal(game.advance(7250).word,'SUN');near(game.nextLetterWindow,2.5);
});

test('an invalid timeout discards once, charges two seconds, and resets all combo progress',()=>{
  const game=create();boost(game);game.select('C',3000);game.select('A',3000);
  const before=game.remaining,result=game.advance(5250);
  assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);
  near(game.remaining,before-2.25-2);assert.equal(game.comboCount,0);near(game.nextLetterWindow,2);
  assert.equal(game.wordCount,3);assert.equal(game.current,'');
  assert.equal(game.advance(5251),null);complete(game,'SUN',5300);assert.equal(game.comboCount,1);
});

test('clear, repeat, incomplete submissions, and spelling failures also reset a combo',()=>{
  for(const action of ['clear','repeat','incomplete','spelling']){
    const game=create();boost(game);
    if(action==='repeat'){spell(game,'CAT',3000);game.submit(3000);}
    else if(action==='spelling'){game.select('Q',3000);}
    else{game.select('C',3000);action==='clear'?game.undo(3000):game.submit(3000);}
    assert.equal(game.comboCount,0);assert.equal(game.comboSeconds,0);near(game.nextLetterWindow,2);
  }
});

test('eight seconds without a completed word resets the combo at the boundary',()=>{
  const game=create();boost(game);game.advance(9999);
  assert.equal(game.comboCount,3);game.advance(10000);assert.equal(game.comboCount,0);
  near(game.nextLetterWindow,2);complete(game,'SUN',10000);assert.equal(game.comboCount,1);
  const boundary=create();boost(boundary);spell(boundary,'SUN',7750);
  const result=boundary.advance(10000);
  assert.equal(result.type,'word');assert.equal(boundary.comboCount,1);near(boundary.nextLetterWindow,2);
});

test('combo expiry honors an already granted letter window; the next pick uses base time',()=>{
  const game=create();boost(game);game.select('C',9900);
  near(game.letterWindow,2.25);game.advance(10000);assert.equal(game.comboCount,0);
  near(game.letterSeconds,2.15);game.select('A',10100);
  near(game.letterSeconds,2);near(game.letterWindow,2);
});

test('pause freezes both timers; slow time does not lengthen the combo expiry window',()=>{
  const game=create();boost(game);game.select('C',2500);game.pause(3000);
  const letter=game.letterSeconds,combo=game.comboSeconds;
  game.advance(100000);near(game.letterSeconds,letter);near(game.comboSeconds,combo);
  game.resume(100000);game.advance(100500);
  near(game.letterSeconds,letter-.5);near(game.comboSeconds,combo-.5);
  const slow=create();boost(slow);slow.activate('hourglass',2000);slow.advance(10000);
  assert.equal(slow.comboCount,0);near(slow.nextLetterWindow,2);
});

test('deadline input resolves a completed word without consuming the clicked tile or double scoring',()=>{
  for(const action of ['select','submit','undo','collectHourglass','pause']){
    const game=create();spell(game,'CAT');game.hourglassOffer=true;
    const result=action==='select'?game.select('C',2000,{grenade:true}):game[action](2000);
    assert.equal(result.type,'word');assert.equal(result.automatic,true);assert.equal(game.score,5);
    assert.equal(game.current,'');assert.equal(game.effects.smoke,0);
    if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
    if(action==='pause')assert.equal(game.phase,'paused');
    assert.equal(game.submit(2000).type,'ignored');assert.equal(game.score,5);
  }
});

test('a delayed frame scores at the deadline even if the round subsequently ends',()=>{
  const game=create({timer:{startSeconds:3}});spell(game,'CAT');
  const result=game.advance(10000);
  assert.equal(result.type,'word');assert.equal(result.ended,true);assert.equal(result.hourglassOffered,false);
  assert.equal(game.score,5);near(game.elapsed,3.5);assert.equal(game.phase,'over');assert.equal(game.comboCount,0);
  const clockFirst=create({timer:{startSeconds:2}});spell(clockFirst,'CAT');
  assert.equal(clockFirst.advance(2000).type,'ended');assert.equal(clockFirst.score,0);
});

test('combo settings are tunable and validated; disabling or restarting clears the boost',()=>{
  const game=create({rules:{nextLetterSeconds:1.5},combo:{wordsToStart:2,maxGapSeconds:5,extraSecondsPerWord:.2,maxExtraSeconds:.3}});
  complete(game,'CAT');complete(game,'DOG',1000);near(game.nextLetterWindow,1.7);
  complete(game,'RAT',2000);near(game.nextLetterWindow,1.8);
  game.start(3000);assert.equal(game.comboCount,0);near(game.nextLetterWindow,1.5);near(game.letterWindow,1.5);
  const disabled=create({combo:{enabled:false}});boost(disabled);assert.equal(disabled.comboCount,0);near(disabled.nextLetterWindow,2);
  for(const combo of [{enabled:1},{wordsToStart:0},{wordsToStart:2.5},{maxGapSeconds:0},{maxGapSeconds:Infinity},{extraSecondsPerWord:-1},{maxExtraSeconds:NaN}])assert.throws(()=>createConfig({combo}),/combo/);
});
