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

test('the first pick leaves a gap, including during periodic density maintenance',async()=>{
  const {DeferredRefills}=await spawnModule,refills=new DeferredRefills(createConfig().falling);
  refills.picked({x:150,y:250},0);
  assert.equal(refills.budget(19,20,true),0);assert.equal(refills.budget(19,20),0);
  assert.deepEqual(refills.blocked(10),[{x:150,y:250}]);
  refills.picked({x:250,y:300},10);
  assert.equal(refills.budget(18,20,true),1);
  refills.placed();assert.equal(refills.budget(19,20),0);
  assert.ok(refills.blocked(20).some(p=>p.x===250&&p.y===300));
  assert.ok(!refills.blocked(20).some(p=>p.x===150&&p.y===250));
  refills.reset();assert.equal(refills.budget(20,20),0);assert.deepEqual(refills.blocked(20),[]);
});

test('later picks replenish safely without putting a tile under the latest tap',async()=>{
  const {viewportLayout,letterTarget,exposedPosition}=await layoutModule,{fieldPosition,DeferredRefills}=await spawnModule,p=await physicsModule,c=createConfig(),size=c.tiles.mobileSize;
  for(let seed=1;seed<=12;seed++){
    const layout=viewportLayout(360,640),random=rng(seed),tiles=[],refills=new DeferredRefills(c.falling);
    const make=pos=>p.prepareTile({...pos,kind:'letter',letter:'A',tilt:0,pitchOffset:.18,yawOffset:-.22,halfDepth:13.1},c,random);
    for(let i=0;i<letterTarget(layout,c);i++){
      const pos=fieldPosition(tiles,layout,size,random);if(!pos)break;tiles.push(make(pos));
    }
    p.settleTiles(tiles,layout.width,size,c.physics);
    const count=tiles.length;assert.ok(count>=16,`Only ${count} opening choices`);
    for(let i=0;i<10;i++){
      const selected=tiles.splice(Math.floor(random()*tiles.length),1)[0];
      refills.picked(selected,i);
      const budget=refills.budget(tiles.length,count,true);assert.equal(budget,i?1:0);
      if(budget){
        const replacement=fieldPosition(tiles,layout,size,random,refills.blocked(i),refills.gaps);
        assert.ok(replacement,`Missing replacement on pick ${i+1}, seed ${seed}`);
        assert.ok(Math.hypot(replacement.x-selected.x,replacement.y-selected.y)>=size*1.4);
        assert.ok(exposedPosition(replacement.x,replacement.y,layout,size/2));
        tiles.push(make(replacement));refills.placed();p.settleTiles(tiles,layout.width,size,c.physics);
      }
      assert.equal(tiles.length,count-1);
      for(let a=0;a<tiles.length;a++)for(let b=a+1;b<tiles.length;b++)assert.ok((p.contact(tiles[a],tiles[b],size)?.penetration||0)<.05);
    }
  }
});

test('open gaps inside recent tap areas are excluded even when a random draw lands there',async()=>{
  const {viewportLayout}=await layoutModule,{fieldPosition}=await spawnModule,layout=viewportLayout(390,844);
  const vacated={x:180,y:300};
  const position=fieldPosition([{x:80,y:300}],layout,47,()=>.5,[vacated]);
  assert.ok(position);assert.ok(Math.hypot(position.x-vacated.x,position.y-vacated.y)>=47*1.4);
});

test('rapid taps retain a short cooldown and blocked replacements can be retried later',async()=>{
  const {DeferredRefills}=await spawnModule,c=createConfig(),refills=new DeferredRefills(c.falling);
  refills.picked({x:150,y:250},0);refills.picked({x:250,y:350},.1);
  assert.equal(new Set(refills.blocked(.1).map(p=>p.x)).size,2);
  assert.equal(refills.budget(18,20),1); // A failed placement keeps its credit.
  assert.equal(refills.budget(18,20),1);
  assert.deepEqual(refills.blocked(1),[{x:250,y:350}]);
  refills.placed();assert.equal(refills.budget(19,20),0);
  assert.throws(()=>createConfig({falling:{replacementCooldownSeconds:-1}}),/replacementCooldownSeconds/);
});
