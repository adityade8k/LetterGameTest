const test=require('node:test');
const assert=require('node:assert/strict');
const {WordGame}=require('../engine.js');
const {createConfig}=require('../config.js');
const words=['CAT','CATS','DOG','SUN','SMILE','STARE','RAT','RATS','HAT','HATS','MAT','MATS','HEN','HENS','TEN','TENS','NET','NETS','PET','PETS','PEN','PENS','COT'];
const make=options=>{const game=new WordGame(words,options);game.start(0);return game;};
const scoreTo=(game,count)=>{while(game.wordCount<count){for(const letter of words[game.wordCount])game.select(letter,0);assert.equal(game.submit(0).type,'word');}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('unlocked letters have exclusive 15% smoke, 3% ice, 16% gold and 3% fire chances',()=>{
 const game=make(),counts={smoke:0,hourglass:0,gold:0,fire:0,normal:0};
 scoreTo(game,12);
 for(let i=0;i<4;i++)game.rollTileTraits(()=>.99); // Guaranteed introductions precede random drops.
 for(let i=0;i<10000;i++){
   const traits=game.rollTileTraits(()=>(i+.5)/10000);
   counts[traits.effect||(traits.bonus?'gold':'normal')]++;assert.equal(traits.grenade,false);assert.ok(!(traits.bonus&&traits.effect));
 }
 assert.deepEqual(counts,{smoke:1500,hourglass:300,gold:1600,fire:300,normal:6300});
 for(const letterEffects of [{purpleChance:-.1},{blueChance:-.1},{purpleChance:.99,blueChance:.03}])assert.throws(()=>createConfig({letterEffects}),/letterEffects/);
 assert.throws(()=>createConfig({bonusLetters:{chance:.9}}),/chances must total/);
});

test('gold, ice, smoke and fire first appear at three, six, ten and twelve scored words',()=>{
 const game=make(),neutral={bonus:false,grenade:false,effect:null};
 assert.deepEqual([game.config.specialTiles.goldUnlockWords,game.config.specialTiles.iceUnlockWords,game.config.specialTiles.smokeUnlockWords,game.config.specialTiles.fireUnlockWords],[3,6,10,12]);
 for(let count=0;count<3;count++){
   scoreTo(game,count);
   for(const roll of [0,.02,.1,.2,.99])assert.deepEqual(game.rollTileTraits(()=>roll),neutral);
 }
 scoreTo(game,3);assert.deepEqual(game.rollTileTraits(()=>.99),{bonus:true,grenade:false,effect:null});
 for(let count=3;count<6;count++){
   scoreTo(game,count);
   for(const roll of [0,.02,.1,.2,.99])assert.equal(game.rollTileTraits(()=>roll).effect,null);
 }
 scoreTo(game,6);assert.deepEqual(game.rollTileTraits(()=>.99),{bonus:false,grenade:false,effect:'hourglass'});
 for(let count=6;count<10;count++){
   scoreTo(game,count);
   for(const roll of [0,.02,.1,.2,.99])assert.notEqual(game.rollTileTraits(()=>roll).effect,'smoke');
 }
 scoreTo(game,10);assert.deepEqual(game.rollTileTraits(()=>.99),{bonus:false,grenade:false,effect:'smoke'});
 for(let count=10;count<12;count++){
   scoreTo(game,count);
   for(const roll of [0,.02,.1,.2,.35,.99])assert.notEqual(game.rollTileTraits(()=>roll).effect,'fire');
 }
 scoreTo(game,12);assert.deepEqual(game.rollTileTraits(()=>.99),{bonus:false,grenade:false,effect:'fire'});
 assert.deepEqual(game.rollTileTraits(()=>.99),neutral);
});

test('fast scoring preserves introduction order and a new round restarts the milestones',()=>{
 const game=make();scoreTo(game,12);
 assert.deepEqual(Array.from({length:4},()=>{const traits=game.rollTileTraits(()=>.99);return traits.effect||(traits.bonus?'gold':null);}),['gold','hourglass','smoke','fire']);
 assert.deepEqual(game.specialIntroductions,{hourglass:true,gold:true,smoke:true,fire:true});
 game.start(10000);assert.deepEqual(game.specialIntroductions,{hourglass:false,gold:false,smoke:false,fire:false});
 assert.deepEqual(game.rollTileTraits(()=>0),{bonus:false,grenade:false,effect:null});
 scoreTo(game,3);assert.deepEqual(game.rollTileTraits(()=>.99),{bonus:true,grenade:false,effect:null});
});

test('only accepted words advance introductions; pause cannot consume a guaranteed tile',()=>{
 const game=make();scoreTo(game,2);
 for(const letter of 'CAT')game.select(letter,0);assert.equal(game.submit(0).reason,'repeat');
 game.select('Z',0);game.select('C',0);game.undo(0);
 assert.equal(game.wordCount,2);assert.deepEqual(game.rollTileTraits(()=>0),{bonus:false,grenade:false,effect:null});
 scoreTo(game,3);game.pause(0);
 assert.deepEqual(game.rollTileTraits(()=>0),{bonus:false,grenade:false,effect:null});assert.equal(game.specialIntroductions.gold,false);
 game.resume(0);assert.equal(game.rollTileTraits(()=>.99).bonus,true);
});

test('special progression milestones are ordered, configurable positive word counts',()=>{
 for(const specialTiles of [{goldUnlockWords:0},{iceUnlockWords:1.5},{goldUnlockWords:6},{iceUnlockWords:3},{smokeUnlockWords:6},{smokeUnlockWords:Infinity},{fireUnlockWords:10},{fireUnlockWords:0},{fireUnlockWords:12.5}])assert.throws(()=>createConfig({specialTiles}),/specialTiles/);
 const game=new WordGame(words,{specialTiles:{goldUnlockWords:1,iceUnlockWords:2,smokeUnlockWords:3,fireUnlockWords:4}});game.start(0);
 for(const [i,effect] of ['gold','hourglass','smoke','fire'].entries()){
   scoreTo(game,i+1);const traits=game.rollTileTraits(()=>.99);assert.equal(traits.effect||(traits.bonus?'gold':null),effect);
 }
});

test('selecting a colored letter adds the letter and triggers only its own effect immediately',()=>{
 for(const effect of ['smoke','hourglass','fire']){
   const game=make(),result=game.select('C',0,{effect,bonus:true});
   const duration=game.config[effect].durationSeconds;
   assert.equal(result.type,'letter');assert.deepEqual(result.tileEffect,{effect,duration});
   assert.equal(game.current,'C');assert.equal(game.currentTiles[0].effect,effect);assert.equal(game.currentTiles[0].bonus,false);assert.equal(result.goldCollected,undefined);
   assert.equal(game.effects[effect],duration);assert.equal(game.effects[effect==='smoke'?'hourglass':'smoke'],0);
   game.select('A',0);game.select('T',0);const word=game.submit(0);
   assert.equal(word.points,5);assert.equal(word.selectedTiles[0].effect,effect);assert.equal(word.hourglassOffered,false);
 }
});

test('gold collection feedback fires for a consumed tile and does not leak through rejected inputs',()=>{
 const game=make();assert.equal(game.select('C',0,{bonus:true}).goldCollected,true);assert.equal(game.hasBonus,true);
 const blank=make();assert.equal(blank.select('?',0,{bonus:true}).goldCollected,undefined);assert.equal(blank.hasBonus,false);
 const paused=make();paused.pause(0);assert.equal(paused.select('C',0,{bonus:true}).goldCollected,undefined);
 const invalid=make();assert.equal(invalid.select('!',0,{bonus:true}).goldCollected,undefined);
 for(const pending of ['CAT','CA']){
   const late=make({rules:{nextLetterSeconds:2}});for(const letter of pending)late.select(letter,0);
   const result=late.select('C',4500,{bonus:true});assert.equal(result.consumed,false);assert.equal(result.goldCollected,undefined);assert.equal(late.hasBonus,false);
 }
 const expired=make();assert.equal(expired.select('C',61000,{bonus:true}).goldCollected,undefined);
 const ending=make();ending.remaining=1;const result=ending.select('Z',0,{bonus:true});assert.equal(result.ended,true);assert.equal(result.goldCollected,undefined);
});

test('blue letters slow both clocks and suppress smoke letters through pause until expiry',()=>{
 const game=make({rules:{nextLetterSeconds:2}});game.select('C',0,{effect:'hourglass'});game.advance(1000);
 near(game.remaining,59.6);near(game.letterSeconds,1.6);
 assert.equal(game.select('A',1000,{effect:'smoke'}).tileEffect,undefined);near(game.effects.smoke,0);near(game.effects.hourglass,5);
 assert.equal(game.select('T',2000,{effect:'smoke'}).tileEffect,undefined);near(game.effects.smoke,0);near(game.effects.hourglass,4);
 game.pause(2000);game.advance(100000);near(game.effects.smoke,0);near(game.effects.hourglass,4);
 game.resume(100000);game.advance(103000);near(game.effects.hourglass,1);near(game.effects.smoke,0);
 game.advance(104000);near(game.effects.hourglass,0);near(game.effects.smoke,0);
 game.start(200000);assert.deepEqual(game.effects,{hourglass:0,smoke:0,fire:0});
});

test('blanks and legacy grenade flags never trigger letter effects',()=>{
 for(const options of [{effect:'smoke',blank:true},{effect:'hourglass',blank:true},{effect:'fire',blank:true},{grenade:true},{effect:'invalid'}]){
   const game=make(),result=game.select('C',0,options);
   assert.equal(result.tileEffect,undefined);assert.deepEqual(game.effects,{hourglass:0,smoke:0,fire:0});
 }
});

test('paused, invalid input and late selection do not consume or activate a colored tile',()=>{
 for(const effect of ['hourglass','smoke','fire']){
   const paused=make();paused.pause(0);assert.equal(paused.select('C',1000,{effect}).type,'ignored');
   assert.deepEqual(paused.effects,{hourglass:0,smoke:0,fire:0});
   const invalid=make();assert.equal(invalid.select('!',0,{effect}).type,'ignored');assert.equal(invalid.effects[effect],0);
   for(const word of ['CAT','CA']){
     const game=make({rules:{nextLetterSeconds:2}});for(const letter of word)game.select(letter,0);
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
