const test=require('node:test');
const assert=require('node:assert/strict');
const coverageModule=import('../three/smoke-coverage.mjs');
const layout={width:360,height:640};
const clearBands={topSolid:0,topClear:0,bottomClear:640,bottomSolid:640};
const bank=(changes={})=>({variant:0,x:.5,y:.5,width:1,height:.5,...changes});
const mask=(alpha=255)=>({size:32,data:new Uint8Array(32*32).fill(alpha)});

test('a solid horizontal bank is fitted to the requested exposed area',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  const patches=[bank()],masks=[mask()];
  for(const target of [.5,.6,.65,.7,.8]){
    const scale=fitSmokeCoverage(patches,masks,layout,clearBands,target);
    // With no veil or clipping, area equals bank width × height × scale.
    assert.ok(Math.abs(.5*scale-target)<.03,`target ${target}, fitted area ${.5*scale}`);
    assert.equal(scale,fitSmokeCoverage(patches,masks,layout,clearBands,target));
  }
  assert.deepEqual(patches,[bank()],'fitting cannot mutate the caller’s bank geometry');
});

test('coverage counts composed alpha at one-half opacity, not the sum of overlapping banks',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  const faint=mask(100);
  assert.equal(fitSmokeCoverage([bank()],[faint],layout,clearBands),1,'a single sub-threshold bank has no counted coverage');
  const scale=fitSmokeCoverage([bank(),bank()],[faint],layout,clearBands);
  // Two 100/255 alpha banks overlap at alpha ≈.63 and cover the same rectangle.
  assert.ok(Math.abs(.5*scale-.65)<.03);
  const opaqueScale=fitSmokeCoverage([bank(),bank()],[mask()],layout,clearBands);
  assert.ok(Math.abs(opaqueScale-scale)<.03,'opaque overlaps must not count their shared area twice');
});

test('WebGL bottom-up masks place opaque lower halves below the bank center',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  const lower=mask(0),upper=mask(0);
  lower.data.fill(255,0,32*16);upper.data.fill(255,32*16);
  const patch=bank({y:.1,height:.6});
  const lowerScale=fitSmokeCoverage([patch],[lower],layout,clearBands,.4);
  // Lower half extends from y=.1 to y=.1+.3*scale, entirely within the field.
  assert.ok(Math.abs(.3*lowerScale-.4)<.03);
  // Its upper mirror is clipped by the top, never exceeding 10% coverage.
  assert.equal(fitSmokeCoverage([patch],[upper],layout,clearBands,.4),1);
});

test('the HUD veil attenuates counted coverage before the opacity threshold',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  const patch=bank({height:1});
  const plainScale=fitSmokeCoverage([patch],[mask()],layout,clearBands);
  const veil={topSolid:0,topClear:256,bottomClear:384,bottomSolid:640};
  const veiledScale=fitSmokeCoverage([patch],[mask()],layout,veil);
  assert.ok(plainScale<.75);
  assert.equal(veiledScale,1,'only the middle 60% can reach half opacity through this veil; preserve natural size when tied');
});

test('empty, missing and transparent masks safely retain the supplied size',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  for(const [patches,masks] of [[[],[]],[[bank()],[]],[[bank()],null],[[bank()],[mask(0)]],[[bank({variant:1})],[mask()]],[[bank()],[{size:32,data:new Uint8Array(10)}]]]){
    assert.equal(fitSmokeCoverage(patches,masks,layout,clearBands),1);
  }
  assert.equal(fitSmokeCoverage([bank()],[mask()],{width:0,height:640},clearBands),1);
  assert.equal(fitSmokeCoverage([bank()],[mask()],layout,{topSolid:100,bottomSolid:80}),1);
});

test('unattainable targets and irregular masks return a finite bounded fit',async()=>{
  const {fitSmokeCoverage}=await coverageModule;
  const striped=mask(0);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)striped.data[y*32+x]=(y%7<3&&x%5<4)?255:0;
  for(const target of [0,.05,.65,1]){
    const scale=fitSmokeCoverage([bank({width:.72,height:.44}),bank({x:.7,y:.8})],[striped],layout,clearBands,target);
    assert.ok(Number.isFinite(scale)&&scale>=.65&&scale<=1.8);
  }
});
