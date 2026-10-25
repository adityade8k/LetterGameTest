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
    assert.ok(Math.abs(initial.spawnSeconds-c.falling.mobileSpawnSeconds/c.density.startFraction)<1e-9);
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
  assert.ok(sparseCount<fullCount);
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

test('scored density eases in continuously, stays bounded, freezes on pause and resets',async()=>{
  const {DensityRamp}=await spawnModule,c=createConfig(),ramp=new DensityRamp(c.density);
  assert.equal(ramp.advance(30,0),0);
  assert.equal(ramp.advance(0,5),0);
  const first=ramp.advance(1/60,5);assert.ok(first>0&&first<.1);
  assert.equal(ramp.advance(0,5),first);
  let previous=first;
  for(let i=0;i<600;i++){const next=ramp.advance(1/60,500);assert.ok(next>=previous&&next<=10);previous=next;}
  assert.ok(previous>9.99);
  ramp.reset();assert.equal(ramp.words,0);
  const fine=new DensityRamp(c.density),coarse=new DensityRamp(c.density);
  for(let i=0;i<120;i++)fine.advance(1/60,6);
  assert.ok(Math.abs(fine.words-coarse.advance(2,6))<1e-9);
  assert.throws(()=>createConfig({density:{transitionSeconds:0}}),/density/);
});

test('arrival cadence preserves progress through rate changes and retries blocked slots without bursts',async()=>{
  const {ArrivalClock}=await spawnModule,clock=new ArrivalClock();
  assert.equal(clock.advance(.5,1),false);
  assert.equal(clock.advance(.25,.5),true);
  // A blocked entry remains due, even on the very next frame.
  assert.equal(clock.advance(1/60,.5),true);
  assert.equal(clock.advance(30,.5),true);
  clock.placed();assert.equal(clock.advance(1/60,.5),false);
  clock.reset();assert.equal(clock.progress,0);
});

test('the sparse opening flows into live arrivals without a large empty band as density grows',async()=>{
  const {supplyProfile,openingFeed,fieldPosition,spawnPosition,ArrivalClock,DensityRamp}=await spawnModule;
  const {viewportLayout}=await layoutModule,p=await import('../three/physics.mjs');
  const c=createConfig(),size=c.tiles.mobileSize,layout=viewportLayout(360,640);
  for(let seed=1;seed<=40;seed++){
    const random=rng(seed),clock=new ArrivalClock(),ramp=new DensityRamp(c.density);let tiles=[];
    const make=pos=>p.prepareTile({...pos,kind:'letter',letter:'E',halfDepth:13.1},c,random);
    const opening=supplyProfile(layout,size,c,0);
    for(let i=0;i<opening.target;i++){const pos=fieldPosition(tiles,layout,size,random);if(pos)tiles.push(make(pos));}
    tiles.push(...openingFeed(tiles,layout,size,c,random,opening.fraction).map(make));
    p.settleTiles(tiles,360,size,c.physics);
    let maxGap=0;
    for(let frame=0;frame<900;frame++){
      // Alternate rounds with no scoring and rounds reaching full density.
      const words=seed%2?0:Math.floor(frame/90);
      const supply=supplyProfile(layout,size,c,ramp.advance(1/30,words));
      p.stepTiles(tiles,1/30,{width:360,size,speed:c.falling.pixelsPerSecond,config:c,difficultyLevel:frame/1350});
      tiles=tiles.filter(t=>t.y<640+size);
      if(clock.advance(1/30,supply.spawnSeconds)){
        const pos=spawnPosition(tiles,360,size,{...c,falling:{...c.falling,letterLimit:supply.limit}},random);
        if(pos){assert.ok(pos.y<0);tiles.push(make(pos));clock.placed();}
      }
      const fieldTop=layout.panels[0].h+size*.6,fieldBottom=layout.panels[1].y-size*.6;
      const ys=tiles.filter(t=>t.y>=fieldTop&&t.y<=fieldBottom).map(t=>t.y).sort((a,b)=>a-b),edges=[fieldTop,...ys,fieldBottom];
      for(let i=1;i<edges.length;i++)maxGap=Math.max(maxGap,edges[i]-edges[i-1]);
      if(frame%30===0)for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)assert.ok((p.contact(tiles[i],tiles[j],size)?.penetration||0)<.05);
    }
    // The compact HUD exposes a taller field; compare coverage as a fraction
    // of that field rather than the former fixed 306-pixel inspection strip.
    const exposedHeight=layout.panels[1].y-layout.panels[0].h-size*1.2;
    assert.ok(maxGap<exposedHeight*.3,`Seed ${seed}: empty band reached ${maxGap.toFixed(1)}px`);
  }
});
