const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const layoutModule=import('../three/layout.mjs'),spawnModule=import('../three/spawn.mjs'),physicsModule=import('../three/physics.mjs');
const rng=(seed=41)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);

test('the same portrait world and controls fill the canvas at every display scale',async()=>{
  const {viewportLayout,exposedPosition,letterTarget}=await layoutModule,c=createConfig();
  for(const [w,h] of [[360,640],[390,390*16/9],[480,480*16/9],[506.25,900]]){
    const layout=viewportLayout(w,h),scale=w/layout.width;
    assert.ok(Math.abs(layout.height*scale-h)<1e-8);
    assert.ok(Math.abs(layout.width-360)<1e-8);assert.ok(Math.abs(layout.height-640)<1e-8);
    assert.ok(Math.abs(layout.left+180-layout.width/2)<1e-8);
    for(const panel of layout.panels){
      assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.w<=layout.width&&panel.y+panel.h<=layout.height);
      assert.equal(exposedPosition(panel.x+panel.w/2,panel.y+panel.h/2,layout),false);
    }
    assert.ok(letterTarget(layout,c)>=20&&letterTarget(layout,c)<=48);
    assert.equal(exposedPosition(-1,200,layout),false);
  }
});

test('the first pick holds its replacement until a later pick, including maintenance',async()=>{
  const {DeferredRefills}=await spawnModule,refills=new DeferredRefills();
  refills.picked();
  assert.equal(refills.budget(19,20,true),0);assert.equal(refills.budget(19,20),0);
  refills.picked();assert.equal(refills.budget(18,20,true),1);
  refills.placed();assert.equal(refills.budget(19,20),0);
  refills.reset();assert.equal(refills.budget(20,20),0);
});

test('replacements after repeated picks enter above the screen and fall into the board',async()=>{
  const {viewportLayout,letterTarget}=await layoutModule,{fieldPosition,spawnPosition,DeferredRefills}=await spawnModule,p=await physicsModule,c=createConfig(),size=c.tiles.mobileSize;
  for(let seed=1;seed<=6;seed++){
    const layout=viewportLayout(360,640),random=rng(seed),tiles=[],refills=new DeferredRefills();
    const make=pos=>p.prepareTile({...pos,kind:'letter',letter:'A',tilt:0,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},c,random);
    for(let i=0;i<letterTarget(layout,c);i++){
      const pos=fieldPosition(tiles,layout,size,random);if(!pos)break;tiles.push(make(pos));
    }
    p.settleTiles(tiles,layout.width,size,c.physics);
    let replacements=0;
    for(let i=0;i<10;i++){
      tiles.shift();refills.picked();
      const budget=refills.budget(tiles.length,20,true);assert.equal(budget,i?1:0);
      if(budget){
        const position=spawnPosition(tiles,layout.width,size,c,random);
        if(position){
          assert.ok(position.y+size/Math.SQRT2<0,'A new tile must start entirely above the canvas');
          tiles.push(make(position));refills.placed();replacements++;
        }
      }
      p.stepTiles(tiles,1.5,{width:layout.width,size,speed:c.falling.pixelsPerSecond,config:c,random});
      for(let a=0;a<tiles.length;a++)for(let b=a+1;b<tiles.length;b++)assert.ok((p.contact(tiles[a],tiles[b],size)?.penetration||0)<.05);
    }
    assert.ok(replacements>0);
  }
});

test('only the opening board uses scattered positions within the play area',async()=>{
  const {viewportLayout,exposedPosition}=await layoutModule,{fieldPosition}=await spawnModule,layout=viewportLayout(360,640),random=rng();
  const tiles=[];
  for(let i=0;i<20;i++){
    const position=fieldPosition(tiles,layout,47,random);if(!position)break;
    assert.ok(exposedPosition(position.x,position.y,layout,47/2));tiles.push(position);
  }
  assert.ok(tiles.length>=16);
  assert.ok(new Set(tiles.map(p=>Math.floor(p.y/50))).size>=4);
});

test('a blocked top entry keeps its replacement queued and never falls back to a middle gap',async()=>{
  const {DeferredRefills,spawnPosition}=await spawnModule,c=createConfig(),refills=new DeferredRefills(),size=c.tiles.mobileSize;
  const count=Math.floor(360/(size+c.tiles.gapPixels));
  const blockers=Array.from({length:count},(_,i)=>({kind:'letter',x:(i+.5)*360/count,y:-size}));
  refills.picked();refills.picked();
  assert.equal(spawnPosition(blockers,360,size,c),null);
  assert.equal(refills.budget(18,20),1);
  blockers.forEach(tile=>tile.y+=size*2);
  const position=spawnPosition(blockers,360,size,c,()=>.5);
  assert.ok(position&&position.y<0);refills.placed();assert.equal(refills.budget(19,20),0);
  const full=Array.from({length:c.falling.letterLimit},()=>({kind:'letter',x:180,y:300}));
  assert.equal(spawnPosition(full,360,size,c),null);
});

test('opening handoff and later supply maintain coverage without a vertical gap or overlaps',async()=>{
  const {viewportLayout}=await layoutModule,{fieldPosition,openingFeed,streamLimit,spawnPosition}=await spawnModule,p=await physicsModule;
  // Exercise the dense-supply preset explicitly rather than locking editable defaults.
  const c=createConfig({falling:{mobileSpawnSeconds:.35},rotation:{minDegreesPerSecond:5.6,maxDegreesPerSecond:22.4}}),size=c.tiles.mobileSize,layout=viewportLayout(360,640);
  const incomingConfig={...c,falling:{...c.falling,letterLimit:streamLimit(layout,size,c)}};
  for(let seed=1;seed<=5;seed++){
    const random=rng(seed);let tiles=[],clock=0,maxGap=0,minVisible=Infinity;
    const make=pos=>p.prepareTile({...pos,kind:'letter',letter:'E',tilt:.05,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},c,random);
    for(let i=0;i<20;i++){const pos=fieldPosition(tiles,layout,size,random);if(pos)tiles.push(make(pos));}
    const bridge=openingFeed(tiles,layout,size,c,random);
    assert.ok(bridge.length>=5);assert.ok(new Set(bridge.map(t=>Math.round(t.y))).size>4);
    tiles.push(...bridge.map(make));p.settleTiles(tiles,360,size,c.physics);
    for(let frame=0;frame<900;frame++){
      p.stepTiles(tiles,1/30,{width:360,size,speed:c.falling.pixelsPerSecond,config:c,random});
      tiles=tiles.filter(t=>t.y<640+size);clock+=1/30;
      if(clock>=c.falling.mobileSpawnSeconds){
        clock%=c.falling.mobileSpawnSeconds;
        const pos=spawnPosition(tiles,360,size,incomingConfig,random);
        if(pos){assert.ok(pos.y+size/Math.SQRT2<0);tiles.push(make(pos));}
      }
      const fieldTop=layout.panels[0].h+size*.6,fieldBottom=layout.panels[1].y-size*.6;
      const ys=tiles.filter(t=>t.y>=fieldTop&&t.y<=fieldBottom).map(t=>t.y).sort((a,b)=>a-b);
      minVisible=Math.min(minVisible,ys.length);
      const edges=[fieldTop,...ys,fieldBottom];
      for(let i=1;i<edges.length;i++)maxGap=Math.max(maxGap,edges[i]-edges[i-1]);
      if(frame%30===0)for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)assert.ok((p.contact(tiles[i],tiles[j],size)?.penetration||0)<.05);
    }
    assert.ok(maxGap<100,`Seed ${seed}: ${maxGap.toFixed(1)}px vertical gap`);
    assert.ok(minVisible>=14,`Seed ${seed}: only ${minVisible} fully visible letters`);
  }
});

test('compact chrome anchors to tall phone safe areas and leaves most of the field available',async()=>{
  const {viewportLayout,fieldVeilBands}=await layoutModule;
  for(const [w,h,safeTop,safeBottom] of [[320,568,0,0],[390,844,47,34],[430,932,59,34],[506.25,900,0,0]]){
    const layout=viewportLayout(w,h,safeTop,safeBottom),bands=fieldVeilBands(layout);
    assert.ok((layout.visibleArea-layout.bottom*layout.width)/(layout.width*(layout.height-layout.top-layout.bottom))>.75);
    assert.equal(layout.panels[0].y+layout.panels[0].h,bands.topSolid);
    assert.equal(layout.panels[1].y,bands.bottomSolid);
    assert.ok(bands.topClear<bands.bottomClear);
    assert.ok(layout.panels[1].y+layout.panels[1].h<=layout.height-layout.bottom);
  }
});
