const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const words=['CAT','CATCH','CATS','DOG','DOGS','RAT','RATS','SUN','SUNS','HAT','HATS','MAT','MATS','HEN','HENS','TEN','TENS','NET','NETS','PET','PETS','PEN','PENS','COT'];
const create=options=>{const game=new WordGame(words,options,()=>0);game.start(0);return game;};
const spell=(game,word,now=0,options={})=>{for(const letter of word)game.select(letter,now,options);};
const complete=(game,word,now=0)=>{spell(game,word,now);return game.submit(now);};
const boost=game=>{for(const [i,word] of ['CAT','DOG','RAT'].entries())complete(game,word,i*1000);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('a valid word auto-submits once with its normal points and time',()=>{
  const game=create();spell(game,'CAT');
  assert.equal(game.config.rules.nextLetterSeconds,4.5);
  assert.equal(game.advance(4499),null);
  const result=game.advance(4500);
  assert.equal(result.type,'word');assert.equal(result.automatic,true);
  assert.equal(result.word,'CAT');assert.equal(result.points,5);near(result.reward,.5);
  near(game.remaining,56);near(result.activeSeconds,4.5);assert.equal(game.current,'');assert.equal(game.letterSeconds,0);
  assert.equal(game.score,5);assert.deepEqual(game.words,['CAT']);assert.equal(game.comboCount,1);
  assert.equal(game.advance(7000),null);assert.equal(game.score,5);near(game.remaining,53.5);
});

test('automatic submissions preserve blank scoring, gold rewards, repeats, without separate pickup drops',()=>{
  const game=create({specialTiles:{warmupSeconds:0},hourglass:{minWordsBetweenDrops:2,maxWordsBetweenDrops:2}});
  game.select('C',0,{bonus:true});game.select('?',0);game.select('T',0);
  const first=game.advance(5000);
  assert.equal(first.word,'CAT');assert.equal(first.points,4);near(first.requestedReward,.7);
  spell(game,'CAT',5000);const repeat=game.advance(10000);
  assert.equal(repeat.reason,'repeat');assert.equal(repeat.penalty,2);assert.equal(game.comboCount,0);assert.equal(game.score,4);
  spell(game,'CATCH',10000);const longer=game.advance(15000);
  assert.equal(longer.points,12);near(longer.requestedReward,14.4);assert.equal(longer.hourglassOffered,false);assert.equal(game.hourglassOffer,false);
  assert.equal(game.collectedPoints('CAT'),4);assert.equal(game.score,16);
});

test('third quick word unlocks the boost; further words grow it only to the cap',()=>{
  const game=create();const expected=[4.5,4.5,4.75,5,5.25,5.5,5.75,6,6.25,6.5,6.75,7,7.25,7.5,7.5,7.5,7.5,7.5,7.5,7.5,7.5,7.5,7.5,7.5];
  assert.equal(game.config.combo.maxExtraSeconds,3);
  for(let i=0;i<expected.length;i++){
    const result=complete(game,words[i],i*1000);
    assert.equal(result.type,'word');assert.equal(game.comboCount,i+1);
    near(game.nextLetterWindow,expected[i]);assert.equal(result.letterWindow,expected[i]);
  }
  game.select('M',24000);near(game.letterSeconds,7.5);near(game.letterWindow,7.5);
  game.select('A',30000);near(game.letterSeconds,7.5);assert.equal(game.current,'MA');
});

test('manual and automatic words contribute to the same quick-word combo',()=>{
  const game=create();complete(game,'CAT',0);spell(game,'DOG',1000);
  assert.equal(game.advance(6000).automatic,true);
  complete(game,'RAT',7000);assert.equal(game.comboCount,3);near(game.nextLetterWindow,4.75);
  spell(game,'SUN',8000);assert.equal(game.advance(12749),null);
  assert.equal(game.advance(12750).word,'SUN');near(game.nextLetterWindow,5);
});

test('an invalid timeout discards once, charges two seconds, and resets all combo progress',()=>{
  const game=create();boost(game);game.select('C',3000);game.select('A',3000);
  const before=game.remaining,result=game.advance(7750);
  assert.equal(result.reason,'timeout');assert.equal(result.penalty,2);
  near(game.remaining,before-4.75-2);assert.equal(game.comboCount,0);near(game.nextLetterWindow,4.5);
  assert.equal(game.wordCount,3);assert.equal(game.current,'');
  assert.equal(game.advance(7751),null);complete(game,'SUN',7800);assert.equal(game.comboCount,1);
});

test('clear, repeat, incomplete submissions, and spelling failures also reset a combo',()=>{
  for(const action of ['clear','repeat','incomplete','spelling']){
    const game=create();boost(game);
    if(action==='repeat'){spell(game,'CAT',3000);game.submit(3000);}
    else if(action==='spelling'){game.select('Q',3000);}
    else{game.select('C',3000);action==='clear'?game.undo(3000):game.submit(3000);}
    assert.equal(game.comboCount,0);assert.equal(game.comboSeconds,0);near(game.nextLetterWindow,4.5);
  }
});

test('eight seconds without a completed word resets the combo at the boundary',()=>{
  const game=create();boost(game);game.advance(9999);
  assert.equal(game.comboCount,3);game.advance(10000);assert.equal(game.comboCount,0);
  near(game.nextLetterWindow,4.5);complete(game,'SUN',10000);assert.equal(game.comboCount,1);
  const boundary=create();boost(boundary);spell(boundary,'SUN',5250);
  const result=boundary.advance(10000);
  assert.equal(result.type,'word');assert.equal(boundary.comboCount,1);near(boundary.nextLetterWindow,4.5);
});

test('combo expiry honors an already granted letter window; the next pick uses base time',()=>{
  const game=create();boost(game);game.select('C',9900);
  near(game.letterWindow,4.75);game.advance(10000);assert.equal(game.comboCount,0);
  near(game.letterSeconds,4.65);game.select('A',10100);
  near(game.letterSeconds,4.5);near(game.letterWindow,4.5);
});

test('pause freezes both timers; slow time does not lengthen the combo expiry window',()=>{
  const game=create();boost(game);game.select('C',2500);game.pause(3000);
  const letter=game.letterSeconds,combo=game.comboSeconds;
  game.advance(100000);near(game.letterSeconds,letter);near(game.comboSeconds,combo);
  game.resume(100000);game.advance(100500);
  near(game.letterSeconds,letter-.5);near(game.comboSeconds,combo-.5);
  const slow=create();boost(slow);slow.activate('hourglass',2000);slow.advance(10000);
  assert.equal(slow.comboCount,0);near(slow.nextLetterWindow,4.5);
});

test('deadline input resolves a completed word without consuming the clicked tile or double scoring',()=>{
  for(const action of ['select','submit','undo','collectHourglass','pause']){
    const game=create();spell(game,'CAT');game.hourglassOffer=true;
    const result=action==='select'?game.select('C',4500,{grenade:true}):game[action](4500);
    assert.equal(result.type,'word');assert.equal(result.automatic,true);assert.equal(game.score,5);
    assert.equal(game.current,'');assert.equal(game.effects.smoke,0);
    if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
    if(action==='pause')assert.equal(game.phase,'paused');
    assert.equal(game.submit(4500).type,'ignored');assert.equal(game.score,5);
  }
});

test('a delayed frame scores at the deadline even if the round subsequently ends',()=>{
  const game=create({timer:{startSeconds:6}});spell(game,'CAT');
  const result=game.advance(10000);
  assert.equal(result.type,'word');assert.equal(result.ended,true);assert.equal(result.hourglassOffered,false);
  assert.equal(game.score,5);near(game.elapsed,6.5);assert.equal(game.phase,'over');assert.equal(game.comboCount,0);
  const clockFirst=create({timer:{startSeconds:4.5}});spell(clockFirst,'CAT');
  assert.equal(clockFirst.advance(4500).type,'ended');assert.equal(clockFirst.score,0);
});

test('combo settings are tunable and validated; disabling or restarting clears the boost',()=>{
  const game=create({rules:{nextLetterSeconds:1.5},combo:{wordsToStart:2,maxGapSeconds:5,extraSecondsPerWord:.2,maxExtraSeconds:.3}});
  complete(game,'CAT');complete(game,'DOG',1000);near(game.nextLetterWindow,1.7);
  complete(game,'RAT',2000);near(game.nextLetterWindow,1.8);
  game.start(3000);assert.equal(game.comboCount,0);near(game.nextLetterWindow,1.5);near(game.letterWindow,1.5);
  const disabled=create({combo:{enabled:false}});boost(disabled);assert.equal(disabled.comboCount,0);near(disabled.nextLetterWindow,4.5);
  for(const combo of [{enabled:1},{wordsToStart:0},{wordsToStart:2.5},{maxGapSeconds:0},{maxGapSeconds:Infinity},{extraSecondsPerWord:-1},{maxExtraSeconds:NaN}])assert.throws(()=>createConfig({combo}),/combo/);
});
