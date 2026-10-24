const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const opening=require('../opening.js');
const {WordGame}=require('../engine.js');
const supply=import('../three/letter-supply.mjs'),spawning=import('../three/spawn.mjs'),physics=import('../three/physics.mjs');
const rng=(seed=73)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);

test('unassisted letters follow English corpus frequencies, including rare letters',async()=>{
  const {FrequencyLetterSupply}=await supply,c=createConfig(),draw=new FrequencyLetterSupply(c.letterFrequency,rng());
  const counts=Object.fromEntries(Object.keys(c.letterFrequency).map(letter=>[letter,0])),total=Object.values(c.letterFrequency).reduce((a,b)=>a+b);
  for(let i=0;i<200000;i++)counts[draw.next()]++;
  for(const [letter,weight] of Object.entries(c.letterFrequency)){
    const observed=counts[letter]/200000,expected=weight/total;
    assert.ok(Math.abs(observed-expected)<.002,`${letter}: ${observed} versus ${expected}`);
    assert.ok(counts[letter]>0);
  }
  assert.ok(counts.E>counts.Z*80);assert.ok(counts.T>counts.B*5);
});

test('frequency weights normalize and preserve the existing fourth-letter assist mixture',async()=>{
  const {FrequencyLetterSupply,PrefixLetterSupply}=await supply,c=createConfig();
  const base=new FrequencyLetterSupply({A:1,E:3},rng(5));
  const helped=new PrefixLetterSupply(['CART','CARTS'],c.wordAssist,rng(6));
  const counts={A:0,E:0,S:0};
  for(let i=0;i<30000;i++)counts[helped.next('CART',new Set(),()=>base.next())]++;
  assert.ok(counts.S/30000>.33&&counts.S/30000<.37);
  assert.ok(counts.E/counts.A>2.8&&counts.E/counts.A<3.2);
  for(const prefix of ['','C','CA','CAR'])for(let i=0;i<100;i++)assert.ok(['A','E'].includes(helped.next(prefix,new Set(),()=>base.next())));
  assert.throws(()=>createConfig({letterFrequency:{E:-1}}),/letterFrequency/);
  assert.throws(()=>createConfig({letterFrequency:Object.fromEntries(Object.keys(c.letterFrequency).map(letter=>[letter,0]))}),/letterFrequency/);
});

test('sixteen scattered opening tiles keep long-word guarantees and use frequency-drawn filler',async()=>{
  const c=createConfig(),dictionary=new Set(opening.wordSets.flat());
  const {prepareTile,settleTiles,contact}=await physics;
  for(let seed=1;seed<=12;seed++){
    const random=rng(seed);let fillerCalls=0;
    const result=opening.lettersFor(dictionary,c.opening.mobileTiles,()=>{fillerCalls++;return 'E';},random);
    assert.equal(result.letters.length,16);assert.equal(fillerCalls,9);
    for(const word of result.words){const bag=[...result.letters];for(const letter of word){const i=bag.indexOf(letter);assert.ok(i>=0);bag.splice(i,1);}}
    const positions=opening.scatter(16,360,337,47,c.opening,random);
    const tiles=positions.map((p,i)=>prepareTile({...p,letter:result.letters[i],kind:'letter',tilt:(random()-.5)*.2,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},c,random));
    settleTiles(tiles,360,47,c.physics);
    for(let i=0;i<tiles.length;i++){
      assert.ok(tiles[i].y>23.5&&tiles[i].y<337-23.5);
      for(let j=i+1;j<tiles.length;j++)assert.equal(contact(tiles[i],tiles[j],47),null);
    }
  }
});

test('dense supply reuses safe incoming space, keeps the population cap, and excludes pickups',async()=>{
  const {spawnPosition,hasLetterRoom}=await spawning,c=createConfig();
  const row=Array.from({length:5},(_,i)=>({kind:'letter',x:(i+.5)*72,y:25}));
  assert.ok(spawnPosition(row,360,47,c,()=>.5)); // Old corridor rule blocked every column here.
  assert.equal(spawnPosition(row.map(t=>({...t,y:-40})),360,47,c),null);
  const full=Array.from({length:26},()=>({kind:'letter',x:180,y:300}));
  assert.equal(spawnPosition(full,360,47,c),null);
  full.pop();full.push({kind:'hourglass',x:180,y:300});assert.equal(hasLetterRoom(full,26),true);
  assert.throws(()=>createConfig({falling:{letterLimit:8}}),/letterLimit/);
});

test('constant dense supply sustains more choices through a minute without tile overlap',async()=>{
  // Density is a specific configurable preset, independent of the user's saved tuning.
  const c=createConfig({falling:{mobileSpawnSeconds:.35},rotation:{minDegreesPerSecond:5.6,maxDegreesPerSecond:22.4}}),p=await physics,{spawnPosition}=await spawning,random=rng(10);
  let tiles=[],clock=0;const visible=[];
  for(let frame=0;frame<1800;frame++){
    p.stepTiles(tiles,1/30,{width:360,size:47,speed:c.falling.pixelsPerSecond,config:c,random});
    tiles=tiles.filter(t=>t.y<337+47);clock+=1/30;
    if(clock>=c.falling.mobileSpawnSeconds){
      clock=0;const pos=spawnPosition(tiles,360,47,c,random);
      if(pos)tiles.push(p.prepareTile({...pos,kind:'letter',letter:frame%3?'E':'W',tilt:.05,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},c,random));
    }
    assert.ok(tiles.length<=c.falling.letterLimit);
    if(frame>450)visible.push(tiles.filter(t=>t.y>23.5&&t.y<313.5).length);
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
      assert.ok((p.contact(tiles[i],tiles[j],47)?.penetration||0)<.05);
    }
  }
  const average=visible.reduce((a,b)=>a+b)/visible.length;
  assert.ok(average>=17,`Only ${average.toFixed(1)} fully visible choices on average`);
});

test('specials keep their 20-second warm-up independently of the steady pace',()=>{
  const game=new WordGame(['CATCH','SMILE'],{hourglass:{spawnChance:1}},()=>0);game.start(0);
  for(const letter of 'CATCH')game.select(letter,19999);
  assert.equal(game.submit(19999).hourglassOffered,false);assert.equal(game.rollTileTraits(()=>0).grenade,false);
  game.advance(20000);assert.equal(game.rollTileTraits(()=>0).grenade,false);
  for(const letter of 'SMILE')game.select(letter,20000);
  assert.equal(game.submit(20000).hourglassOffered,true);
  game.start(30000);assert.equal(game.rollTileTraits(()=>0).grenade,false);
});
