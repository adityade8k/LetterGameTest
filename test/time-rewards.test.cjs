const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const words=['CAT','QUIZ','CATCH','PLANET','FLOWER','FLOWERS','ANIMALS','ELEPHANT','ELEPHANTS'];
const make=options=>{const game=new WordGame(words,options);game.start(0);return game;};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const spell=(game,word,now=0,options={})=>[...word].forEach(letter=>game.select(letter,now,options));
const score=(word,remaining,options)=>{
  const game=make(options);game.remaining=remaining;spell(game,word);
  return {game,result:game.submit(0)};
};

test('six-letter words refill to 45 at or below the threshold and add ten strictly above it',()=>{
  for(const remaining of [.01,1,44.999,45,45.001,50,50.001,59.999,60,60.001,80,85,90]){
    const {game,result}=score('PLANET',remaining);
    const target=remaining<=45?45:Math.min(90,remaining+10);
    near(game.remaining,target);near(result.reward,target-remaining);
    near(result.requestedReward,remaining<=45?45-remaining:10);
    assert.equal(result.points,game.pointsFor('PLANET'));assert.ok(result.reward>=0);
  }
});

test('seven-letter words refill to the normal 60-second maximum without reducing overtime',()=>{
  for(const remaining of [.01,45,59.999,60,60.001,75,90]){
    const {game,result}=score('FLOWERS',remaining),target=Math.max(60,remaining);
    near(game.remaining,target);near(result.reward,target-remaining);near(result.requestedReward,target-remaining);
  }
});

test('eight or more letters refill to 90 seconds without accumulating time beyond that ceiling',()=>{
  for(const word of ['ELEPHANT','ELEPHANTS'])for(const remaining of [.01,45,60,60.001,75,89.999,90]){
    const {game,result}=score(word,remaining);
    near(game.maxTimeSeconds,90);near(game.remaining,90);
    near(result.reward,90-remaining);near(result.requestedReward,90-remaining);
  }
  const game=make();game.remaining=20;spell(game,'ELEPHANT');game.submit(0);
  spell(game,'ELEPHANTS');assert.equal(game.submit(0).reward,0);assert.equal(game.remaining,90);
  spell(game,'PLANET');assert.equal(game.submit(0).reward,0);assert.equal(game.remaining,90);
});

test('shorter words keep ordinary rewards and may only replenish overtime that already exists',()=>{
  for(const [word,reward] of [['CAT',.5],['QUIZ',2],['CATCH',14.4]]){
    for(const remaining of [10,59,60,60.001,75,89,90]){
      const {game,result}=score(word,remaining),cap=remaining>60?90:60;
      near(result.requestedReward,reward);near(game.remaining,Math.min(cap,remaining+reward));
      near(result.reward,game.remaining-remaining);assert.ok(result.reward>=0);
    }
  }
  const game=make();game.remaining=61;game.advance(2000);spell(game,'CATCH',2000);
  near(game.submit(2000).reward,1);near(game.remaining,60,'overtime privileges end once the clock returns below the normal maximum');
});

test('gold and blanks affect letter points but never change the long-word time refill',()=>{
  for(const word of ['PLANET','FLOWERS','ELEPHANT'])for(const bonus of [false,true]){
    const game=make();game.remaining=20;spell(game,word,0,{bonus});
    const result=game.submit(0),target=word.length===6?45:word.length===7?60:90;
    near(game.remaining,target);near(result.reward,target-20);
    assert.equal(result.points,game.pointsFor(word)*(bonus?2:1));assert.equal(result.bonusReward,0);
  }
  const game=make();game.remaining=20;spell(game,'?LEPHANT',0,{bonus:true});
  const result=game.submit(0);
  assert.equal(result.word,'ELEPHANT');assert.equal(result.blankCount,1);assert.equal(result.points,(game.pointsFor('ELEPHANT')-1)*2);
  near(result.reward,70);near(game.remaining,90);
});

test('repeating a long word grants no points, refill, or overtime',()=>{
  for(const word of ['PLANET','FLOWERS','ELEPHANT']){
    const game=make();spell(game,word);game.submit(0);game.remaining=20;spell(game,word,0,{bonus:true});
    assert.equal(game.pendingReward,0);
    const result=game.submit(0);
    assert.equal(result.type,'repeat');assert.equal(result.points,0);assert.equal(result.reward,0);assert.equal(result.requestedReward,0);
    assert.equal(game.remaining,20);assert.equal(game.wordCount,1);
  }
});

test('automatic submissions use the clock at their exact deadline, then spend delayed-frame time normally',()=>{
  for(const fire of [false,true])for(const [word,start,deadline,reward,after] of [
    ['PLANET',48,3,0,44],
    ['PLANET',49,3,10,55],
    ['FLOWERS',40,3.5,23.5,59],
    ['ELEPHANT',20,4,74,89],
  ]){
    const game=make({rules:{nextLetterSeconds:2,extensionSecondsPerLetter:.5}});game.remaining=start;if(fire)game.activate('fire',0);spell(game,word);
    const result=game.advance((deadline+1)*1000);
    assert.equal(result.type,'word');assert.equal(result.automatic,true);near(result.activeSeconds,deadline);
    near(result.reward,reward);near(game.remaining,after);assert.equal(game.timeScale,1);
  }
});

test('custom normal maximum, overtime multiplier and six-letter targets are respected',()=>{
  const options={timer:{maxSeconds:80,overtimeMultiplier:1.25},rewards:{sixLetterTargetSeconds:50,sixLetterBonusSeconds:12}};
  for(const [word,remaining,expected] of [['PLANET',49,50],['PLANET',50,50],['PLANET',51,63],['PLANET',79,91],['PLANET',95,100],['FLOWERS',20,80],['FLOWERS',90,90],['ELEPHANT',20,100]]){
    const {game,result}=score(word,remaining,options);near(game.maxTimeSeconds,100);near(game.remaining,expected);assert.ok(result.reward>=0);
  }
  const small={timer:{startSeconds:20,maxSeconds:30,overtimeMultiplier:2}};
  near(score('PLANET',20,small).game.remaining,30,'the six-letter target cannot exceed the custom normal maximum');
  near(score('FLOWERS',20,small).game.remaining,30);
  near(score('ELEPHANT',20,small).game.remaining,60);
});

test('no accepted word can deduct time when an existing clock is above its reward ceiling',()=>{
  for(const word of ['CAT','QUIZ','CATCH','PLANET','FLOWERS','ELEPHANT']){
    const {game,result}=score(word,95);
    assert.equal(result.reward,0);assert.ok(result.requestedReward>=0);assert.equal(game.remaining,95);
  }
});

test('overtime drains and pauses normally, and a new round restores its original start time',()=>{
  const game=make();game.remaining=20;spell(game,'ELEPHANT');game.submit(0);
  game.pause(10000);near(game.remaining,80);game.advance(100000);near(game.remaining,80);
  game.resume(100000);game.advance(120000);near(game.remaining,60);
  game.advance(180000);assert.equal(game.phase,'over');near(game.remaining,0);near(game.elapsed,90);
  game.start(200000);assert.equal(game.remaining,60);assert.equal(game.maxTimeSeconds,90);
});

test('overtime and six-letter reward configuration reject invalid values',()=>{
  for(const overtimeMultiplier of [0,.99,-1,Infinity,NaN])assert.throws(()=>createConfig({timer:{overtimeMultiplier}}),/overtimeMultiplier/);
  for(const key of ['sixLetterTargetSeconds','sixLetterBonusSeconds'])for(const value of [-1,Infinity,NaN]){
    assert.throws(()=>createConfig({rewards:{[key]:value}}),new RegExp(key));
  }
  const game=make({timer:{overtimeMultiplier:1}});game.remaining=20;spell(game,'ELEPHANT');game.submit(0);assert.equal(game.remaining,60);
});
