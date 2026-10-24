const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const make=()=>{const game=new WordGame(['CAT','CATS','DOG','SUN','SMILE','STARE']);game.start(0);return game;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('letter traits have exclusive 15% smoke and 3% slow-time chances independent of gold',()=>{
 const game=make(),counts={smoke:0,hourglass:0,normal:0};
 for(let i=0;i<10000;i++){
   let draw=0;const traits=game.rollTileTraits(()=>draw++===0?.5:(i+.5)/10000);
   counts[traits.effect||'normal']++;assert.equal(traits.grenade,false);assert.equal(traits.bonus,false);
 }
 assert.deepEqual(counts,{smoke:1500,hourglass:300,normal:8200});
 for(const roll of [.01,.1,.9]){
   let draw=0;assert.equal(game.rollTileTraits(()=>draw++===0?0:roll).bonus,true);
 }
 for(const letterEffects of [{purpleChance:-.1},{blueChance:-.1},{purpleChance:.99,blueChance:.03}])assert.throws(()=>createConfig({letterEffects}),/letterEffects/);
});

test('selecting a colored letter adds the letter and triggers only its own effect immediately',()=>{
 for(const effect of ['smoke','hourglass']){
   const game=make(),result=game.select('C',0,{effect,bonus:true});
   assert.equal(result.type,'letter');assert.deepEqual(result.tileEffect,{effect,duration:5});
   assert.equal(game.current,'C');assert.equal(game.currentTiles[0].effect,effect);assert.equal(game.currentTiles[0].bonus,true);
   assert.equal(game.effects[effect],5);assert.equal(game.effects[effect==='smoke'?'hourglass':'smoke'],0);
   game.select('A',0);game.select('T',0);const word=game.submit(0);
   assert.equal(word.points,5);assert.equal(word.selectedTiles[0].effect,effect);assert.equal(word.hourglassOffered,false);
 }
});

test('blue letters slow both clocks; purple smoke can coexist, refresh, pause and reset',()=>{
 const game=make();game.select('C',0,{effect:'hourglass'});game.advance(1000);
 near(game.remaining,59.6);near(game.letterSeconds,4.1);
 game.select('A',1000,{effect:'smoke'});near(game.effects.smoke,5);near(game.effects.hourglass,4);
 game.select('T',2000,{effect:'smoke'});near(game.effects.smoke,5);near(game.effects.hourglass,3);
 game.pause(2000);game.advance(100000);near(game.effects.smoke,5);near(game.effects.hourglass,3);
 game.resume(100000);game.advance(103000);near(game.effects.hourglass,0);near(game.effects.smoke,2);
 game.start(200000);assert.deepEqual(game.effects,{hourglass:0,smoke:0});
});

test('blanks and legacy grenade flags never trigger letter effects',()=>{
 for(const options of [{effect:'smoke',blank:true},{effect:'hourglass',blank:true},{grenade:true},{effect:'invalid'}]){
   const game=make(),result=game.select('C',0,options);
   assert.equal(result.tileEffect,undefined);assert.deepEqual(game.effects,{hourglass:0,smoke:0});
 }
});

test('paused, invalid input and late selection do not consume or activate a colored tile',()=>{
 for(const effect of ['hourglass','smoke']){
   const paused=make();paused.pause(0);assert.equal(paused.select('C',1000,{effect}).type,'ignored');
   assert.deepEqual(paused.effects,{hourglass:0,smoke:0});
   const invalid=make();assert.equal(invalid.select('!',0,{effect}).type,'ignored');assert.equal(invalid.effects[effect],0);
   for(const word of ['CAT','CA']){
     const game=make();for(const letter of word)game.select(letter,0);
     const result=game.select('S',4500,{effect});assert.equal(result.consumed,false);assert.equal(result.tileEffect,undefined);assert.equal(game.effects[effect],0);
   }
   const ended=make(),result=ended.select('C',61000,{effect});assert.equal(result.consumed,false);assert.equal(result.tileEffect,undefined);assert.equal(ended.effects[effect],0);
 }
});

test('a consumed misspelling triggers its tile effect unless the penalty ends the round',()=>{
 const game=make(),result=game.select('Z',0,{effect:'smoke'});
 assert.equal(result.type,'penalty');assert.equal(result.tileEffect.effect,'smoke');assert.equal(game.current,'');
 const ending=make();ending.remaining=1;const last=ending.select('Z',0,{effect:'hourglass'});
 assert.equal(last.ended,true);assert.equal(last.tileEffect,undefined);assert.equal(ending.effects.hourglass,0);
});

test('scoring any number or length of words never creates an independent pickup',()=>{
 const game=make();
 for(const word of ['CAT','CATS','DOG','SUN','SMILE','STARE']){
   for(const letter of word)game.select(letter,0);
   assert.equal(game.submit(0).hourglassOffered,false);assert.equal(game.hourglassOffer,false);
 }
 assert.equal(game.collectPickup('smoke',0).type,'ignored');assert.equal(game.collectHourglass(0).type,'ignored');
});
