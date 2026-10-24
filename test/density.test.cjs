const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const {WordGame}=require('../engine.js');
const spawnModule=import('../three/spawn.mjs'),layoutModule=import('../three/layout.mjs');
const rng=(seed=41)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);

test('density starts sparse, grows monotonically with scored words and caps at the previous supply',async()=>{
  const {supplyProfile,streamLimit}=await spawnModule,{viewportLayout,letterTarget}=await layoutModule,c=createConfig();
  for(const width of [360,390,480]){
    const layout=viewportLayout(width,width*16/9),profile=n=>supplyProfile(layout,c.tiles.mobileSize,c,n);
    const initial=profile(0),full=profile(c.density.wordsToFull);
    assert.equal(initial.target,14);assert.equal(initial.limit,38);
    assert.ok(Math.abs(initial.spawnSeconds-1.02857142857)<1e-9);
    assert.equal(full.target,Math.max(c.opening.mobileTiles,letterTarget(layout,c)));
    assert.equal(full.limit,streamLimit(layout,c.tiles.mobileSize,c));
    assert.equal(full.spawnSeconds,c.falling.mobileSpawnSeconds);
    let previous=initial;
    for(let words=1;words<=100;words++){
      const current=profile(words);
      assert.ok(current.target>=previous.target&&current.target<=full.target);
      assert.ok(current.limit>=previous.limit&&current.limit<=full.limit);
      assert.ok(current.spawnSeconds<=previous.spawnSeconds&&current.spawnSeconds>=full.spawnSeconds);
      if(words>=c.density.wordsToFull)assert.deepEqual(current,full);
      previous=current;
    }
  }
});

test('only successful words increase density; time, pauses, mistakes and repeats do not, and restart resets it',async()=>{
  const {supplyProfile}=await spawnModule,{viewportLayout}=await layoutModule,game=new WordGame(['CAT','CATS','DOG']);
  const c=game.config,layout=viewportLayout(360,640),profile=()=>supplyProfile(layout,c.tiles.mobileSize,c,game.wordCount);
  const spell=word=>{for(const letter of word)game.select(letter,0);};
  game.start(0);const initial=profile();
  spell('CAT');assert.equal(game.submit(0).type,'word');const earned=profile();
  assert.ok(earned.fraction>initial.fraction);
  spell('CAT');assert.equal(game.submit(0).reason,'repeat');assert.deepEqual(profile(),earned);
  spell('Z');assert.deepEqual(profile(),earned);
  game.pause(0);game.advance(5000);assert.deepEqual(profile(),earned);
  game.start(0);assert.deepEqual(profile(),initial);
  game.advance(1000);assert.deepEqual(profile(),initial);
});

test('sparse opening preserves word guarantees while reducing hidden feed and limiting replacements',async()=>{
  const {supplyProfile,openingFeed,spawnPosition}=await spawnModule,{viewportLayout}=await layoutModule;
  const {lettersFor}=require('../opening.js'),dictionary=new Set(require('../data/words.js').map(w=>w.toUpperCase()));
  const c=createConfig(),size=c.tiles.mobileSize,layout=viewportLayout(360,640),supply=supplyProfile(layout,size,c,0);
  let sparseCount=0,fullCount=0;
  for(let seed=1;seed<=100;seed++){
    const opening=lettersFor(dictionary,supply.target-c.wildcards.openingTiles,'AEIOURSTLN',rng(seed));
    assert.equal(opening.letters.length+c.wildcards.openingTiles,supply.target);
    for(const word of opening.words){const remaining=[...opening.letters];for(const letter of word){const index=remaining.indexOf(letter);assert.ok(index>=0);remaining.splice(index,1);}}
    sparseCount+=openingFeed([],layout,size,c,rng(seed),supply.fraction).length;
    fullCount+=openingFeed([],layout,size,c,rng(seed),1).length;
  }
  assert.ok(sparseCount<fullCount*.8);
  const incoming={...c,falling:{...c.falling,letterLimit:supply.limit}};
  const tiles=Array.from({length:supply.limit},()=>({kind:'letter',x:180,y:300}));
  assert.equal(spawnPosition(tiles,360,size,incoming),null);
  tiles.pop();assert.ok(spawnPosition(tiles,360,size,incoming));
});

test('density settings reject invalid values and support restoring full supply immediately',async()=>{
  for(const density of [{startFraction:0},{startFraction:-1},{startFraction:1.01},{wordsToFull:0},{wordsToFull:1.5}])assert.throws(()=>createConfig({density}),/density/);
  const {supplyProfile}=await spawnModule,{viewportLayout}=await layoutModule,c=createConfig({density:{startFraction:1}}),layout=viewportLayout(360,640);
  assert.deepEqual(supplyProfile(layout,c.tiles.mobileSize,c,0),supplyProfile(layout,c.tiles.mobileSize,c,100));
});
