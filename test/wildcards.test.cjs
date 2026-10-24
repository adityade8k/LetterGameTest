const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const create=(words,options={})=>{const game=new WordGame(words,options);game.start(0);return game;};
const spell=(game,pattern)=>[...pattern].map(letter=>game.select(letter,0)).at(-1);

test('a blank resolves automatically at the beginning, middle, or end and scores zero',()=>{
  for(const [pattern,points] of [['?AT',2],['C?T',4],['CA?',4],['??T',1]]){
    const game=create(['CAT']);spell(game,pattern);
    assert.equal(game.current,pattern);assert.equal(game.isWord,true);assert.equal(game.pendingPoints,points);
    const result=game.submit(0);
    assert.equal(result.word,'CAT');assert.equal(result.points,points);assert.equal(game.score,points);
    assert.equal(game.collectedPoints('CAT'),points);assert.equal(game.current,'');
    assert.ok(Math.abs(result.requestedReward-points*.1)<1e-9);
  }
});

test('wildcards keep every viable interpretation open as the word grows',()=>{
  const game=create(['CAT','COT','CATCH']);spell(game,'C?T');
  assert.deepEqual(new Set(game.currentPrefixes),new Set(['CAT','COT']));
  assert.equal(game.select('C',0).type,'letter');assert.equal(game.isWord,false);
  assert.equal(game.select('H',0).type,'letter');
  const result=game.submit(0);assert.equal(result.word,'CATCH');assert.equal(result.points,11);assert.equal(result.requestedReward,16.5);
});

test('ambiguous blanks prefer an unused matching word, then apply the repeat penalty',()=>{
  const game=create(['CAT','COT']);spell(game,'CAT');game.submit(0);
  spell(game,'C?T');assert.equal(game.isRepeat,false);assert.equal(game.submit(0).word,'COT');
  const before=game.remaining;spell(game,'C?T');assert.equal(game.isRepeat,true);
  const repeat=game.submit(0);assert.equal(repeat.reason,'repeat');assert.equal(game.remaining,before-2);
  assert.deepEqual(game.words,['CAT','COT']);assert.equal(game.score,9);
});

test('a blank does not bypass impossible-prefix, incomplete-word, clear, or restart rules',()=>{
  const game=create(['CATCH']);spell(game,'C?T');assert.equal(game.submit(0).reason,'incomplete');
  spell(game,'C?');assert.equal(game.select('Z',0).reason,'spelling');assert.deepEqual(game.currentPrefixes,['']);
  spell(game,'C?');assert.equal(game.undo(0).reason,'clear');assert.deepEqual(game.currentPrefixes,['']);
  spell(game,'C?TCH');game.submit(0);assert.equal(game.collectedPoints('CATCH'),11);
  game.start(0);assert.equal(game.wordScores.size,0);assert.deepEqual(game.currentPrefixes,['']);
  spell(game,'CATCH');assert.equal(game.submit(0).points,12);
});

test('blanks cannot gain points or gold time from their resolved letter',()=>{
  const game=create(['CAT']);game.select('C',0,{bonus:true});game.select('?',0,{bonus:true,grenade:true});game.select('T',0);
  assert.equal(game.effects.smoke,0);assert.equal(game.currentTiles[1].bonus,false);
  const result=game.submit(0);assert.equal(result.points,4);
  assert.ok(Math.abs(result.requestedReward-.7)<1e-9);assert.ok(Math.abs(result.bonusReward-.3)<1e-9);
});

test('continuation help honors wildcard positions and excludes collected matches',async()=>{
  const {PrefixLetterSupply}=await import('../three/letter-supply.mjs');
  const words=['CART','CARTS','CARTON','CASTS','COATS','DARTS'];
  const supply=new PrefixLetterSupply(words,createConfig().wordAssist);
  assert.deepEqual(supply.candidates('C?R'),[]);
  assert.deepEqual(new Set(supply.candidates('CA?T').map(x=>x.letter)),new Set(['S','O','N']));
  assert.deepEqual(supply.candidates('?ART',new Set(['CARTS','CARTON','DARTS'])),[]);
});

test('the full dictionary resolves only words matching the entire wildcard pattern',()=>{
  const game=create(require('../data/words.js'));
  for(const pattern of ['?ATCH','CA?CH','CATC?','C??CH']){
    spell(game,pattern);
    const result=game.submit(0);
    if(result.type==='word'){
      assert.ok(game.dictionary.has(result.word));assert.equal(result.word.length,pattern.length);
      assert.ok([...pattern].every((letter,i)=>letter==='?'||result.word[i]===letter));
      assert.equal(result.points,game.pointsFor(pattern));
    }else assert.equal(result.reason,'repeat');
  }
  assert.throws(()=>createConfig({wildcards:{chance:1.1}}),/wildcards/);
  assert.throws(()=>createConfig({wildcards:{openingTiles:-1}}),/wildcards/);
});
