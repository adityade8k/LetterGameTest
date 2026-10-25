const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const spell=(g,w,t=0)=>[...w].forEach(letter=>g.select(letter,t));

test('confirmed words expose exact selected tiles and credited time without leaking pending validity',()=>{
 const g=new WordGame(['CATCH']);g.start(0);g.remaining=59;
 g.select('C',0,{bonus:true});g.select('?',0);spell(g,'TCH');
 const r=g.submit(0);
 assert.equal(r.word,'CATCH');assert.equal(r.pattern,'C?TCH');assert.equal(r.blankCount,1);
 assert.equal(r.selectedTiles.length,5);assert.equal(r.selectedTiles[0].bonus,true);
 assert.equal(r.selectedTiles[1].blank,true);assert.equal(r.points,22);assert.equal(r.basePoints,11);assert.equal(r.scoreMultiplier,2);
 assert.equal(r.reward,Math.min(g.config.timer.maxSeconds-59,r.requestedReward));
 assert.equal(r.activeSeconds,0);assert.equal(r.wordIndex,1);
 assert.deepEqual(g.currentTiles,[]);
 spell(g,'CATCH');assert.equal(g.submit(0).type,'repeat');assert.equal(g.wordCount,1);
});

test('a delayed auto-submit event keeps its true time even if the remainder ends the round',()=>{
 const g=new WordGame(['CAT']);g.start(0);spell(g,'CAT');
 const r=g.advance(100000);
 assert.equal(r.type,'word');assert.equal(r.automatic,true);assert.equal(r.ended,true);
 assert.equal(r.activeSeconds,g.config.rules.nextLetterSeconds);
 assert.equal(r.blankCount,0);assert.equal(r.selectedTiles.map(t=>t.letter).join(''),'CAT');
 assert.equal(g.phase,'over');assert.equal(g.wordCount,1);
});

test('event-to-Wordbook integration keeps known words playable in a new round',async()=>{
 const {ProgressStore}=await import('../progress.mjs');const memory=new Map();
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const p=new ProgressStore(storage);const g=new WordGame(['CAT']);
 for(let i=1;i<=2;i++){
  g.start(0);p.beginRound('round'+i);spell(g,'CAT');const event=g.submit(0);
  assert.equal(event.type,'word');
  const result=p.recordWord(event,{roundId:'round'+i,eventId:'round'+i+':1',activeSeconds:event.activeSeconds});
  assert.equal(result.isNew,i===1);
  p.finishRound({roundId:'round'+i,score:g.score,activeSeconds:g.elapsed,bestChain:g.comboCount});
 }
 const loaded=new ProgressStore(storage).snapshot();
 assert.equal(loaded.totalWords,1);assert.equal(loaded.entries[0].timesPlayed,2);
 assert.equal(loaded.stats.roundsPlayed,2);assert.equal(loaded.stats.totalPoints,10);
});


test('a neutral repeat never enters Wordbook history or changes unique-word progress',async()=>{
 const {ProgressStore}=await import('../progress.mjs');const memory=new Map();
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const p=new ProgressStore(storage),g=new WordGame(['CAT']);g.start(0);p.beginRound('repeat-round');
 spell(g,'CAT');const accepted=g.submit(0);p.recordWord(accepted,{eventId:'accepted'});
 const snapshot=p.snapshot(),before={score:g.score,count:g.wordCount,remaining:g.remaining,mistakes:g.mistakes,combo:g.comboCount,comboSeconds:g.comboSeconds,wordScores:[...g.wordScores],introductions:{...g.specialIntroductions}};
 g.select('C',0,{bonus:true});spell(g,'AT');
 assert.equal(g.pendingPoints,0);assert.equal(g.pendingReward,0);
 const repeat=g.submit(0);
 assert.equal(repeat.type,'repeat');assert.equal(repeat.word,'CAT');assert.equal(repeat.pattern,'CAT');assert.equal(repeat.automatic,false);
 assert.equal(repeat.points,0);assert.equal(repeat.reward,0);assert.equal(repeat.requestedReward,0);assert.equal(repeat.penalty,0);
 assert.equal(repeat.wordIndex,undefined);assert.equal(repeat.selectedTiles[0].bonus,true);
 assert.deepEqual(p.recordWord(repeat,{eventId:'repeat'}),{ignored:true,reason:'not-an-accepted-word'});
 assert.deepEqual(p.snapshot(),snapshot);
 assert.deepEqual({score:g.score,count:g.wordCount,remaining:g.remaining,mistakes:g.mistakes,combo:g.comboCount,comboSeconds:g.comboSeconds,wordScores:[...g.wordScores],introductions:{...g.specialIntroductions}},before);
 assert.equal(g.current,'');assert.deepEqual(g.currentTiles,[]);assert.equal(g.letterSeconds,0);
});

test('automatic repeat deadline wins over late input and cannot consume a special tile',()=>{
 for(const action of ['select','submit','undo','collectHourglass','pause']){
  const g=new WordGame(['CAT']);g.start(0);spell(g,'CAT');g.submit(0);spell(g,'CAT');g.hourglassOffer=true;
  const result=action==='select'?g.select('C',2000,{effect:'smoke'}):g[action](2000);
  assert.equal(result.type,'repeat');assert.equal(result.automatic,true);assert.equal(result.points,0);
  assert.equal(result.activeSeconds,2);assert.equal(g.score,5);assert.equal(g.wordCount,1);assert.equal(g.remaining,58);
  assert.equal(g.mistakes,0);assert.equal(g.effects.smoke,0);assert.equal(g.current,'');
  if(['select','collectHourglass'].includes(action))assert.equal(result.consumed,false);
  if(action==='pause')assert.equal(g.phase,'paused');
 }
});

test('a delayed automatic repeat preserves its event without extending the round',()=>{
 const g=new WordGame(['CAT']);g.start(0);spell(g,'CAT');g.submit(0);spell(g,'CAT');
 const result=g.advance(70000);
 assert.equal(result.type,'repeat');assert.equal(result.ended,true);assert.equal(result.automatic,true);assert.equal(result.activeSeconds,2);
 assert.equal(result.reward,0);assert.equal(result.hourglassOffered,false);assert.equal(g.elapsed,60);assert.equal(g.remaining,0);
 assert.equal(g.score,5);assert.equal(g.wordCount,1);assert.equal(g.mistakes,0);assert.equal(g.phase,'over');
});
