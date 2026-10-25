const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../three/keyboard-hints.mjs');
const desktop={finePointer:true,hover:true};

test('desktop labels follow the platform and use familiar Mac and Windows key names',async()=>{
  const {keyboardHints}=await api;
  assert.deepEqual(keyboardHints({...desktop,platform:'MacIntel'}),{submit:'Return',clear:'Delete'});
  assert.deepEqual(keyboardHints({...desktop,platform:'Win32'}),{submit:'Enter',clear:'Backspace'});
  assert.deepEqual(keyboardHints({...desktop,platform:'Linux x86_64'}),{submit:'Enter',clear:'Backspace'});
  assert.deepEqual(keyboardHints({...desktop,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}),{submit:'Return',clear:'Delete'});
  assert.deepEqual(keyboardHints({...desktop,platform:'Win32',userAgent:'Macintosh'}),{submit:'Enter',clear:'Backspace'},'the reported platform wins over a conflicting user agent');
});

test('phones and tablets do not gain hints even with an attached mouse',async()=>{
  const {keyboardHints}=await api;
  for(const device of [
    {platform:'iPhone',userAgent:'iPhone',maxTouchPoints:5},
    {platform:'iPad',userAgent:'iPad',maxTouchPoints:5},
    {platform:'Linux armv8l',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel)',maxTouchPoints:5},
    {platform:'MacIntel',userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',maxTouchPoints:5},
    {platform:'Linux',userAgent:'Tablet',maxTouchPoints:5},
  ])assert.equal(keyboardHints({...desktop,...device}),null);
});

test('a touchscreen laptop with a fine pointer and hover keeps desktop hints',async()=>{
  const {keyboardHints}=await api;
  assert.deepEqual(keyboardHints({...desktop,platform:'Win32',maxTouchPoints:10,coarsePointer:true}),{submit:'Enter',clear:'Backspace'});
  assert.deepEqual(keyboardHints({...desktop,platform:'Linux x86_64',maxTouchPoints:10,coarsePointer:true}),{submit:'Enter',clear:'Backspace'});
});

test('touch-only and unavailable pointer capabilities leave the canvas uncluttered',async()=>{
  const {keyboardHints}=await api;
  assert.equal(keyboardHints(),null);
  assert.equal(keyboardHints({platform:'Win32',maxTouchPoints:10,coarsePointer:true}),null);
  assert.equal(keyboardHints({platform:'Win32',finePointer:true,hover:false}),null);
  assert.equal(keyboardHints({platform:'Win32',finePointer:false,hover:true}),null);
});
