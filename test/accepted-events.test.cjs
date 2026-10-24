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
 assert.equal(r.selectedTiles[1].blank,true);assert.equal(r.points,11);
 assert.equal(r.reward,Math.min(g.config.timer.maxSeconds-59,r.requestedReward));
 assert.equal(r.activeSeconds,0);assert.equal(r.wordIndex,1);
 assert.deepEqual(g.currentTiles,[]);
 spell(g,'CATCH');assert.equal(g.submit(0).type,'penalty');assert.equal(g.wordCount,1);
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
