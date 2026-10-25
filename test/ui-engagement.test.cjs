const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {registerHooks} = require('node:module');
const {WordGame} = require('../engine.js');
// Node's resolver uses the same local Three.js sources as the browser import map.
if (registerHooks) registerHooks({resolve(specifier,context,next){
  if(specifier==='three')specifier=pathToFileURL(path.resolve(__dirname,'../vendor/three/three.module.js')).href;
  else if(specifier.startsWith('three/addons/'))specifier=pathToFileURL(path.resolve(__dirname,'../vendor',specifier)).href;
  return next(specifier,context);
}});
const supported={skip:!registerHooks};
let shared;
async function create(overrides={},uiOverrides={}){
  shared??=Promise.all([import('../three/ui.js'),import('../vendor/three/three.module.js'),import('../vendor/three/addons/loaders/FontLoader.js')]);
  const [{createUI},THREE,{FontLoader}]=await shared;
  const font=new FontLoader().parse(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vendor/fonts/fredoka-semibold.typeface.json'),'utf8')));
  const game=new WordGame(['CAT','DOG','BIRD','APPLE','ORANGE','FLOWERS','ELEPHANT','TREES'],overrides);
  const ui=createUI(font,{...game.config,...uiOverrides},true);ui.resize({width:360,height:640,left:0,top:0,bottom:0});
  const words=['CAT','DOG','BIRD','APPLE','ORANGE','FLOWERS','ELEPHANT','TREES'];
  const view={mode:'',collectionPage:0,feedback:'',feedbackKind:'',focus:'',hover:'',best:0,roundBest:0,settings:{effects:false,music:false,haptics:false,reducedMotion:true},book:{totalWords:words.length,entries:words.map((word,i)=>({word,length:word.length,firstSeen:100+i,lastSeen:100+i,timesPlayed:i+1,bestPoints:10,withoutBlanks:true})),stats:{roundsPlayed:1,totalWordsPlayed:8},lengthCounts:{3:2,4:1,5:2,6:1,7:1,8:1},goals:[],storageStatus:{state:'saved'}}};
  const camera=new THREE.OrthographicCamera(-180,180,320,-320,.1,100);camera.position.z=60;camera.updateMatrixWorld(true);
  const raycaster=new THREE.Raycaster();
  const hit=(x,y)=>{ui.scene.updateMatrixWorld(true);raycaster.setFromCamera(new THREE.Vector2(x/180-1,1-y/320),camera);return ui.hit(raycaster);};
  const sync=()=>ui.sync(game,view);sync();
  return {ui,game,view,hit,sync,THREE,camera,font};
}

test('home meshes open distinct screens and modal screens expose no underlying controls',supported,async()=>{
  const {ui,view,hit,sync}=await create();
  assert.equal(hit(180,373),'start');assert.equal(hit(100,456),'wordbook');assert.equal(hit(320,30),'settings');
  assert.deepEqual(ui.buttons().map(button=>button.id),['settings','start','wordbook','stats','help']);
  view.mode='settings';sync();
  assert.deepEqual(ui.buttons().map(button=>button.id),['setting:effects','setting:music','setting:haptics','setting:reducedMotion','menu']);
  assert.equal(hit(284,201),'setting:effects');assert.equal(hit(180,578),'menu');
  assert.ok(ui.buttons().every(button=>button.label));
});

test('Wordbook filters, query, sort and pagination expose only matching collected words',supported,async()=>{
  const {ui,view,sync}=await create();view.mode='wordbook';view.wordbookSort='alpha';sync();
  const words=()=>ui.buttons().filter(button=>button.id.startsWith('book-word:')).map(button=>button.id.slice(10));
  assert.equal(ui.wordbookPages(),2);assert.deepEqual(words(),['APPLE','BIRD','CAT','DOG','ELEPHANT']);
  view.wordbookPage=1;sync();assert.deepEqual(words(),['FLOWERS','ORANGE','TREES']);
  view.wordbookPage=0;view.wordbookFilter='3';sync();assert.deepEqual(words(),['CAT','DOG']);assert.equal(ui.wordbookPages(),1);
  view.wordbookFilter='all';view.wordbookQuery='LE';sync();assert.deepEqual(words(),['APPLE','ELEPHANT']);
  view.wordbookFilter='8+';sync();assert.deepEqual(words(),['ELEPHANT']);
  view.wordbookQuery='ZZ';sync();assert.deepEqual(words(),[]);assert.equal(ui.wordbookPages(),1);
});

test('rebuilding menus removes stale mesh controls and keeps keyboard navigation finite',supported,async()=>{
  const {ui,view,sync}=await create();
  for(let i=0;i<12;i++){view.mode=i%2?'wordbook':'search';view.wordbookQuery=i%3?'A':'';sync();const ids=ui.buttons().map(button=>button.id);assert.equal(ids.length,new Set(ids).size);let focus=ids[0];for(let j=0;j<ids.length;j++)focus=ui.focusNext(focus);assert.equal(focus,ids[0]);}
  view.mode='help';sync();assert.deepEqual(ui.buttons().map(button=>button.id),['menu']);
  view.mode='';sync();assert.ok(ui.buttons().some(button=>button.id==='start'));assert.ok(!ui.buttons().some(button=>button.id.startsWith('key:')));
});

test('mobile search keyboard is mesh controlled and detail returns to the collection',supported,async()=>{
  const {ui,view,hit,sync}=await create();view.mode='search';sync();
  assert.equal(ui.buttons().filter(button=>/^key:[A-Z]$/.test(button.id)).length,26);
  assert.equal(hit(36,323),'key:Q');assert.equal(hit(322,323),'key:P');assert.equal(hit(90,480),'key:backspace');assert.equal(hit(180,578),'key:done');
  view.mode='word-detail';view.wordDetail='APPLE';sync();assert.equal(hit(180,578),'book-back');assert.match(ui.description({},view),/APPLE.*5 letters/);
});

test('results compliment the player, show actual round words and link directly to book and progress',supported,async()=>{
  const {ui,game,view,hit,sync}=await create();game.phase='over';view.mode='over';game.words=['APPLE'];view.roundSummary={roundId:'a',newWords:['APPLE'],newWordCount:1,score:10,wordCount:1};sync();
  assert.match(ui.description(game,view),/You've got potential!.*1 word.*Your words: APPLE.*1 new discovery/);
  assert.equal(hit(180,446),'start');assert.equal(hit(100,509),'wordbook');assert.equal(hit(255,509),'stats');assert.equal(hit(180,551),'home');assert.equal(hit(180,330),'collection');assert.equal(hit(180,393),'results-new');
  view.roundSummary={roundId:'b',newWords:[],newWordCount:0};sync();assert.equal(hit(100,509),'wordbook');assert.equal(hit(180,393),null);
  game.words=['CAT','DOG','BIRD'];sync();assert.match(ui.description(game,view),/Good job!/);
  game.words=[];sync();assert.match(ui.description(game,view),/You've got potential!.*0 words.*none yet/);assert.equal(hit(180,330),null);
  view.mode='wordbook';view.wordbookOnlyNew=true;view.roundSummary={roundId:'a',newWords:['APPLE']};sync();
  assert.deepEqual(ui.buttons().filter(button=>button.id.startsWith('book-word:')).map(button=>button.id),['book-word:APPLE']);
});

test('recent play tab reports the observed active window and real five-, six-, seven-letter counts',supported,async()=>{
  const {ui,view,hit,sync}=await create();view.mode='stats';
  view.book.stats.personal={observedSeconds:512,complete:false,windowSeconds:1200,distinctByLength:{5:12,6:4,7:2}};
  sync();assert.equal(hit(105,170),'stats-view:lifetime');assert.equal(hit(255,170),'stats-view:recent');
  view.statsView='recent';sync();
  assert.match(ui.description({},view),/512 seconds observed/);
  assert.match(ui.description({},view),/5 letters: 12, 6 letters: 4, 7 letters: 2/);
  assert.match(ui.description({},view),/without wildcards/);
  assert.match(ui.description({},view),/window is still filling/);
  assert.doesNotMatch(ui.description({},view),/Community comparison/);assert.doesNotMatch(visibleText(ui).join(' '),/COMMUNITY COMPARISON|Not enough real player data/);
  view.book.stats.personal.observedSeconds=1200;view.book.stats.personal.complete=true;sync();assert.match(ui.description({},view),/Full window/);
});

test('configured success duration changes visual settling without delaying gameplay',supported,async()=>{
  const exercise=async duration=>{
    const {ui,game,view,sync}=await create({},{engagement:{successSeconds:duration}});ui.setReducedMotion(false);game.start(0);
    for(const letter of 'CAT')game.select(letter,0);const result=game.submit(0);ui.celebrate(result,game);sync();
    let card;ui.scene.traverse(object=>{if(object.userData.resolvedWord==='CAT')card=object;});assert.ok(card);
    ui.animate(1000,.3,game);assert.equal(game.score,result.points);assert.equal(game.current,'');
    return card.position.y;
  };
  assert.equal(await exercise(.1),-522);
  assert.ok(await exercise(1)>-522);
  assert.ok(Number.isFinite(await exercise(NaN)));
  assert.ok(Number.isFinite(await exercise(-1)));
});

test('wildcard reveal respects the configured discovery duration',supported,async()=>{
  const {ui,game,sync}=await create({engagement:{discoverySeconds:1.2}});game.start(0);
  for(const letter of '?AT')game.select(letter,0);const result=game.submit(0);ui.celebrate(result,game);sync();
  const reveal=()=>{let found;ui.scene.traverse(object=>{if(object.userData.resolvedWord==='CAT')found=object;});return found;};
  assert.ok(reveal()?.visible);
  const letters=reveal().children[0].children;
  assert.notEqual(letters[0].material.uniforms.lightTone.value.getHex(),letters[1].material.uniforms.lightTone.value.getHex());
  ui.animate(1000,.7,game);sync();assert.ok(reveal()?.visible);
  ui.animate(1600,.6,game);sync();assert.ok(!reveal()?.visible);
});

test('controls stay within narrow mobile canvases and their safe areas',supported,async()=>{
  const {viewportLayout}=await import('../three/layout.mjs');
  const {ui,view,sync,THREE,camera}=await create();
  for(const [pixelWidth,pixelHeight,safeTop,safeBottom] of [[320,568,0,0],[320,480,24,16],[390,844,47,34]]){
    const layout=viewportLayout(pixelWidth,pixelHeight,safeTop,safeBottom);ui.resize(layout);
    camera.left=-layout.width/2;camera.right=layout.width/2;camera.top=layout.height/2;camera.bottom=-layout.height/2;camera.updateProjectionMatrix();
    for(const mode of ['','settings','wordbook','search','word-detail','stats','goals','help','paused','over']){
      view.mode=mode;view.wordDetail='APPLE';sync();ui.scene.updateMatrixWorld(true);
      const ids=new Set(ui.buttons().map(button=>button.id));
      ui.scene.traverse(object=>{
        const control=object.userData.control;if(!control||!ids.has(control.id))return;
        for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return;
        const box=new THREE.Box3().setFromObject(object),min=box.min.clone().project(camera),max=box.max.clone().project(camera);
        assert.ok(min.x>=-1&&max.x<=1,`${mode}:${control.id} leaves canvas horizontally`);
        assert.ok(min.y>=-1+2*safeBottom/pixelHeight&&max.y<=1-2*safeTop/pixelHeight,`${mode}:${control.id} leaves safe area vertically`);
      });
    }
  }
});

test('trash clears on the left and paper-plane or word surface submits on the right',supported,async()=>{
  const {ui,game,view,hit,sync}=await create();game.start(0);for(const letter of 'CAT')game.select(letter,0);sync();
  assert.equal(hit(45,581),'undo');assert.equal(hit(180,581),'submit');assert.equal(hit(315,581),'submit');
  assert.match(ui.buttons().find(button=>button.id==='undo').label,/Clear whole word/);
  assert.equal(ui.selectionTarget(0).x,109);assert.equal(ui.selectionTarget(0).y,581);
  const before=game.remaining;game.undo(0);sync();assert.equal(game.current,'');assert.equal(game.remaining,before-game.config.penalties.clearWordSeconds);
  assert.equal(hit(45,581),null);assert.equal(hit(315,581),null);
});

test('point flights start at the word and gate the score through overlapping arrivals and pauses',supported,async()=>{
  const {ui,game,view,hit,sync}=await create();ui.setReducedMotion(false);game.start(0);
  const score=()=>{let value;ui.scene.traverse(object=>{if(Object.hasOwn(object.userData,'displayedScore'))value=object.userData.displayedScore;});return value;};
  const visualFlights=()=>{const flights=[];ui.scene.traverse(object=>{if(object.userData.scoreFlight)flights.push(object);});return flights;};
  const word=letters=>{for(const letter of letters)game.select(letter,0);const result=game.submit(0);view.best=game.score;ui.celebrate(result,game);sync();return result;};
  const first=word('CAT');assert.equal(score(),0);assert.equal(visualFlights().length,1);
  const badge=visualFlights()[0].children[0];assert.ok(badge.position.x>=89&&badge.position.x<=294);assert.equal(badge.position.y,-581);
  assert.equal(hit(180,581),null);ui.animate(400,.4,game);
  const second=word('DOG');assert.equal(score(),0);assert.equal(visualFlights().length,2);
  game.pause(0);view.mode='paused';sync();ui.animate(5400,5,game);assert.equal(score(),0);assert.equal(visualFlights()[0].userData.scoreFlight.age,.4);
  game.resume(0);view.mode='';sync();ui.animate(5900,.5,game);assert.equal(score(),first.points);assert.equal(visualFlights().length,1);
  ui.animate(6300,.4,game);assert.equal(score(),first.points+second.points);assert.equal(visualFlights().length,0);
});

test('reduced motion and game-over/reset settle pending points without lingering flight meshes',supported,async()=>{
  const {ui,game,view,sync}=await create();ui.setReducedMotion(false);game.start(0);
  const score=()=>{let value;ui.scene.traverse(object=>{if(Object.hasOwn(object.userData,'displayedScore'))value=object.userData.displayedScore;});return value;};
  const flights=()=>{let count=0;ui.scene.traverse(object=>{if(object.userData.scoreFlight)count++;});return count;};
  const word=letters=>{for(const letter of letters)game.select(letter,0);ui.celebrate(game.submit(0),game);sync();};
  word('CAT');assert.equal(score(),0);ui.setReducedMotion(true);sync();assert.equal(score(),game.score);assert.equal(flights(),0);
  word('DOG');assert.equal(score(),game.score);assert.equal(flights(),1);ui.animate(400,.4,game);assert.equal(flights(),0);
  ui.setReducedMotion(false);word('APPLE');assert.ok(score()<game.score);game.phase='over';view.mode='over';sync();assert.equal(score(),game.score);assert.equal(flights(),0);
  ui.reset();game.start(0);view.mode='';sync();assert.equal(score(),0);assert.equal(flights(),0);
});


test('help describes staged gold, ice, smoke and fire tile introductions',supported,async()=>{
  const {ui,game,view,sync}=await create();view.mode='help';sync();
  const description=ui.description(game,view);
  assert.match(description,/Ice tiles first appear after 6 scored words/);
  assert.match(description,/Gold tiles first appear after 3 words/);
  assert.match(description,/Magenta smoke tiles appear after 10 words/);
  assert.match(description,/Fire tiles appear after 12 words.*2.5 times faster for 6 seconds/);
  assert.match(description,/Both timers keep their normal pace during fire/);
  assert.match(description,/Six-letter words refill to 45 seconds, or add 10 seconds/);
  assert.match(description,/Seven-letter words refill the normal bar without reducing overtime/);
  assert.match(description,/Eight or more letters refill to 150% overtime/);
  assert.match(description,/Only one timed effect can run at once/);
  assert.match(description,/double.*word score/);
});

test('help describes the opening difficulty ramp and respects a disabled curve',supported,async()=>{
  const normal=await create();normal.view.mode='help';normal.sync();
  assert.match(normal.ui.description(normal.game,normal.view),/ramps up over 45 active seconds.*rises and falls randomly/);
  const easy=await create({difficulty:{enabled:false}});easy.view.mode='help';easy.sync();
  assert.match(easy.ui.description(easy.game,easy.view),/Letter Y spin stays at zero/);
});

test('scored gold feedback is animated, pause-safe, reduced-motion-safe and cleared on restart',supported,async()=>{
  const {ui,game,view,sync}=await create();game.start(0);sync();ui.setReducedMotion(false);
  game.select('C',0,{bonus:true});game.select('A',0);game.select('T',0);ui.celebrate(game.submit(0),game);
  const find=()=>{let found;ui.scene.traverse(o=>{if(o.userData.goldCelebration)found=o;});return found;};
  assert.ok(find());assert.match(ui.description(game,view),/Double Score/);
  ui.animate(100,.1,game);const badge=find().children[0],scale=badge.scale.x;assert.notEqual(scale,1);
  game.pause(0);sync();ui.animate(10000,5,game);assert.equal(find().children[0].scale.x,scale);
  game.resume(0);sync();ui.setReducedMotion(true);ui.animate(10001,.01,game);assert.equal(badge.scale.x,1);assert.equal(badge.rotation.z,0);
  ui.animate(12000,2,game);assert.equal(find(),undefined);
  game.select('D',0,{bonus:true});game.select('O',0);game.select('G',0);ui.celebrate(game.submit(0),game);assert.ok(find());ui.reset();assert.equal(find(),undefined);
});

test('double score appears only for credited gold words, including automatic submission',supported,async()=>{
  const {ui,game,view,sync}=await create({rules:{nextLetterSeconds:2,extensionSecondsPerLetter:.5}});
  const hasRibbon=()=>{let found=false;ui.scene.traverse(o=>{if(o.userData.goldCelebration)found=true;});return found;};
  const observe=result=>{ui.celebrate(result,game);sync();return result;};
  const start=()=>{game.start(0);ui.reset();sync();};
  start();observe(game.select('C',0,{bonus:true}));assert.equal(hasRibbon(),false,'gold pickup is not a score');
  assert.doesNotMatch(ui.description(game,view),/Double Score!/);
  observe(game.undo(0));assert.equal(hasRibbon(),false,'clearing forfeits the gold');
  observe(game.select('Z',0,{bonus:true}));assert.equal(hasRibbon(),false,'invalid gold letter is not a score');
  observe(game.select('C',0,{bonus:true}));observe(game.submit(0));assert.equal(hasRibbon(),false,'incomplete gold word is not a score');
  observe(game.select('C',0,{bonus:true}));observe(game.advance(2000));assert.equal(hasRibbon(),false,'incomplete timeout is not a score');
  start();for(const letter of 'CAT')game.select(letter,0);observe(game.submit(0));assert.equal(hasRibbon(),false,'ordinary scored word has no multiplier');
  game.select('C',0,{bonus:true});game.select('A',0);game.select('T',0);const repeat=observe(game.submit(0));
  assert.equal(repeat.type,'repeat');assert.equal(repeat.points,0);assert.equal(hasRibbon(),false,'repeated gold word earns nothing');
  start();game.select('C',0,{bonus:true});game.select('A',0);game.select('T',0);
  const accepted=observe(game.advance(2000));assert.equal(accepted.type,'word');assert.equal(accepted.automatic,true);assert.ok(accepted.points>0);
  assert.equal(hasRibbon(),true);assert.match(ui.description(game,view),/Double Score! This word earned/);
});

test('compact header and enlarged submit cap keep controls usable without a seconds-left display',supported,async()=>{
  const {ui,game,view,hit,sync}=await create();game.start(0);game.select('C',0);sync();
  assert.equal(hit(316,38),'pause');assert.equal(hit(315,596),'submit');
  assert.doesNotMatch(ui.description(game,view),/Time \d+ seconds/);
  let cap;ui.scene.traverse(o=>{if(o.userData.control?.id==='submit')cap=o.parent;});assert.ok(cap);
  ui.press('submit',1000);ui.animate(1050,.05,game);assert.equal(cap.position.y,-2.5);
  ui.animate(1200,.15,game);assert.equal(cap.position.y,0);
});

function visibleText(ui){
  const values=[];ui.scene.traverse(object=>{if(!object.userData.uiText)return;for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return;values.push(object.userData.uiText);});return values;
}

test('the home and gameplay retain only the requested hierarchy',supported,async()=>{
  const {ui,game,view,sync}=await create();
  const home=visibleText(ui).join(' ');
  assert.doesNotMatch(home,/A little Word Wonder/);assert.match(home,/Catch letters\./);assert.match(home,/Discover your next word\./);
  assert.match(home,/Let's Play/);assert.match(home,/Word Book/);assert.match(home,/Your Progress/);assert.match(home,/How to Play/);
  assert.doesNotMatch(home,/POINTS|BEST|Pick a little goal|MAKE SOMETHING|WORDS COLLECTED/);
  game.start(0);sync();const playing=visibleText(ui).join(' ');
  assert.doesNotMatch(playing,/CLTTR|POINTS|BEST|YOUR WORD|WORDS COLLECTED|A small collection|CHAIN|Catch letters\. Discover/);
  assert.deepEqual(ui.buttons().map(button=>button.id),['pause']);
  for(const letter of 'CAT')game.select(letter,0);sync();assert.deepEqual(ui.buttons().map(button=>button.id),['pause','submit','undo']);
  game.phase='over';view.mode='over';sync();assert.doesNotMatch(visibleText(ui).join(' '),/Every word adds to your story|A fresh set of letters|Personal best/);
});

test('home branding respects reduced motion and the letter meter explains its growing duration',supported,async()=>{
  const {ui,game,view,sync}=await create({rules:{nextLetterSeconds:2,extensionSecondsPerLetter:.5}});
  let tile;ui.scene.traverse(o=>{if(o.userData.brandTile)tile=o;});assert.ok(tile);
  const y=tile.position.y,rotation=tile.rotation.z;ui.animate(1000,1,game);assert.equal(tile.position.y,y);assert.equal(tile.rotation.z,rotation);
  ui.setReducedMotion(false);ui.animate(2000,1,game);assert.notEqual(tile.position.y,y);
  view.mode='help';sync();const instructions=ui.description(game,view);
  assert.match(instructions,/First 4 letters: 2s each.*Letter 5: 2.5s; letter 6: 3s.*Then \+0.5s per letter/);
  assert.match(instructions,/Repeated words earn 0 points with no time penalty/);
  assert.doesNotMatch(instructions,/combo.*adding|Repeats still cost time/);
  view.mode='';game.start(0);for(const letter of 'APPLE')game.select(letter,0);sync();
  assert.match(ui.description(game,view),/Letter window 2.5 seconds/);
});


test('help reflects configured letter timing and menu presses survive a rebuilt menu',supported,async()=>{
  const {ui,game,view,sync}=await create({rules:{nextLetterSeconds:1.5,extensionAfterLength:3,extensionSecondsPerLetter:.75}});
  view.mode='help';sync();assert.match(ui.description(game,view),/First 3 letters: 1.5s each.*Letter 4: 2.25s; letter 5: 3s.*Then \+0.75s per letter/);
  assert.match(visibleText(ui).join(' '),/First 3 letters: 1.5s each/);
  view.mode='word-detail';view.wordDetail='APPLE';sync();assert.doesNotMatch(visibleText(ui).join(' '),/Definitions are not part|A record of your discoveries/);
  view.mode='settings';sync();ui.press('setting:effects',1000);view.settings.effects=true;sync();ui.animate(1050,.05,game);
  let cap;ui.scene.traverse(o=>{if(o.userData.control?.id==='setting:effects')cap=o.parent;});assert.ok(cap);assert.equal(cap.position.y,-2.5);
  ui.animate(1200,.15,game);assert.equal(cap.position.y,0);
});


test('the round clock has its own prominent rail below controls and fire leaves clock colors unchanged',supported,async()=>{
  const {ui,game,sync,THREE}=await create();game.start(0);game.select('C',0);sync();
  const find=key=>{let found;ui.scene.traverse(o=>{if(o.userData[key])found=o;});return found;};
  const timer=find('roundTimeBar'),track=find('roundTimeTrack');assert.ok(timer&&track);
  ui.scene.updateMatrixWorld(true);const timerBox=new THREE.Box3().setFromObject(timer),trackBox=new THREE.Box3().setFromObject(track);
  assert.ok(timerBox.max.y-timerBox.min.y>=10,'the round fill is more prominent at phone size');
  for(const id of ['pause']){
    let control;ui.scene.traverse(o=>{if(o.userData.control?.id===id)control=o.userData.control;});
    const bounds=new THREE.Box3().setFromObject(control.face);
    for(const part of control.root.children)if(part.visible&&part.isMesh&&part.geometry.type==='ExtrudeGeometry')bounds.expandByObject(part);
    assert.ok(trackBox.max.y<bounds.min.y-3,'rail clears the pause cap and its foot');
  }
  const ordinaryMaterial=timer.material;game.effects.fire=game.config.fire.durationSeconds;sync();assert.equal(timer.material,ordinaryMaterial,'fire does not imply a faster clock');
  game.effects.fire=0;game.effects.hourglass=game.config.hourglass.durationSeconds;sync();assert.notEqual(timer.material,ordinaryMaterial,'ice still indicates its slowed clock');
  game.effects.hourglass=0;game.remaining=10;sync();assert.notEqual(timer.material,ordinaryMaterial,'low time remains prominent');
});

test('overtime has a gold excess meter and a single brief label without a percentage',supported,async()=>{
  const {ui,game,view,sync,THREE}=await create();game.start(0);sync();
  const find=key=>{let found;ui.scene.traverse(o=>{if(o.userData[key])found=o;});return found;};
  const timer=find('roundTimeBar'),overtime=find('overtimeBar');
  assert.equal(overtime.visible,false);assert.doesNotMatch(visibleText(ui).join(' '),/OVERTIME/);
  game.remaining=75;sync();assert.equal(timer.scale.x,1);assert.equal(overtime.visible,true);assert.equal(overtime.scale.x,.5);
  assert.match(visibleText(ui).join(' '),/OVERTIME/);assert.match(ui.description(game,view),/Overtime!/);
  assert.doesNotMatch(visibleText(ui).join(' '),/OVERTIME\s+\d|%/);
  game.remaining=90;ui.celebrate({type:'word',word:'ELEPHANT',points:20,reward:15},game);sync();ui.animate(100,.1,game);
  assert.equal(overtime.scale.x,1);assert.match(visibleText(ui).join(' '),/OVERTIME/);
  ui.scene.updateMatrixWorld(true);const badge=new THREE.Box3().setFromObject(find('overtimeLabel')),reward=new THREE.Box3().setFromObject(find('timeReward'));
  assert.ok(reward.max.y<badge.min.y-3,'the refill reward stays below the overtime label');
  assert.ok(badge.min.x>-30&&badge.max.x<117,'overtime fits between score and pause');
  ui.animate(1700,1.6,game);sync();assert.equal(overtime.visible,true);
  assert.doesNotMatch(visibleText(ui).join(' '),/OVERTIME/);
  assert.doesNotMatch(ui.description(game,view),/Overtime/);
  game.remaining=60;sync();assert.equal(overtime.visible,false);assert.doesNotMatch(visibleText(ui).join(' '),/OVERTIME/);
  assert.equal(timer.scale.x,1);game.remaining=30;sync();assert.equal(timer.scale.x,.5);
});

test('normal and overtime meter capacities follow configuration rather than the starting clock',supported,async()=>{
  const {ui,game,sync}=await create({timer:{startSeconds:40,maxSeconds:80,overtimeMultiplier:1.5}});game.start(0);sync();
  let timer,overtime;ui.scene.traverse(o=>{if(o.userData.roundTimeBar)timer=o;if(o.userData.overtimeBar)overtime=o;});
  assert.equal(timer.scale.x,.5);game.remaining=100;sync();assert.equal(timer.scale.x,1);assert.equal(overtime.scale.x,.5);
  assert.match(visibleText(ui).join(' '),/OVERTIME/);assert.doesNotMatch(visibleText(ui).join(' '),/%/);
});

test('clock milestones animate once, freeze during pause and stay still with reduced motion',supported,async()=>{
  const {ui,game,sync}=await create();ui.setReducedMotion(false);game.start(0);sync();
  let assembly,timer;ui.scene.traverse(o=>{if(o.userData.roundTimeAssembly)assembly=o;if(o.userData.roundTimeBar)timer=o;});
  const highMaterial=timer.material;game.remaining=30;sync();assert.equal(assembly.userData.timerCue,'half');
  assert.equal(assembly.userData.timerStage,'middle');assert.notEqual(timer.material,highMaterial);
  const middleMaterial=timer.material;ui.animate(200,.2,game);const pulse=assembly.scale.clone();assert.ok(pulse.y>1);
  game.phase='paused';sync();ui.animate(1200,1,game);assert.deepEqual(assembly.scale,pulse);
  game.phase='running';game.remaining=15;sync();assert.equal(assembly.userData.timerCue,'quarter');assert.notEqual(timer.material,middleMaterial);
  ui.animate(1300,.1,game);assert.ok(assembly.scale.y>1);
  ui.setReducedMotion(true);sync();assert.equal(assembly.scale.x,1);assert.equal(assembly.scale.y,1);
  ui.animate(2300,1,game);assert.equal(assembly.userData.timerCue,'');
  ui.reset();game.remaining=60;sync();assert.equal(assembly.userData.timerCue,'');
});


test('text batches matching inks without changing glyph bounds, bevels or special-letter colors',supported,async()=>{
  const {ui,game,sync,THREE,font}=await create();game.start(0);
  game.select('A',0,{bonus:true});game.select('P',0,{effect:'smoke'});game.select('P',0,{effect:'hourglass'});game.select('L',0,{effect:'smoke'});game.select('E',0,{effect:'fire'});sync();
  let word;ui.scene.traverse(o=>{if(o.userData.uiText==='APPLE')word=o;});assert.ok(word);
  assert.equal(word.children.length,4,'matching magenta letters share one mesh while gold, ice and fire keep their ink');
  const {TextGeometry}=await import('../vendor/three/addons/geometries/TextGeometry.js');
  const expected=new THREE.Box3();let cursor=0,vertices=0;
  for(const char of 'APPLE'){
    const glyph=new TextGeometry(char,{font,size:24,depth:.7,curveSegments:3,bevelEnabled:true,bevelThickness:.12,bevelSize:.1,bevelSegments:1});
    glyph.computeBoundingBox();expected.union(glyph.boundingBox.clone().translate(new THREE.Vector3(cursor,0,0)));vertices+=glyph.attributes.position.count;
    cursor+=font.data.glyphs[char].ha/font.data.resolution*24;glyph.dispose();
  }
  const actual=new THREE.Box3();let mergedVertices=0;
  for(const mesh of word.children){mesh.geometry.computeBoundingBox();actual.union(mesh.geometry.boundingBox);mergedVertices+=mesh.geometry.attributes.position.count;}
  assert.equal(mergedVertices,vertices,'batching keeps the complete raised glyph surfaces');
  for(const axis of ['x','y','z']){assert.ok(Math.abs(actual.min[axis]-expected.min[axis])<.0001);assert.ok(Math.abs(actual.max[axis]-expected.max[axis])<.0001);}
  const disposed=[];for(const mesh of word.children)mesh.geometry.addEventListener('dispose',()=>disposed.push(mesh.geometry));
  game.undo(0);sync();assert.equal(disposed.length,4,'replaced word buffers are released');
  let placeholder;ui.scene.traverse(o=>{if(o.userData.uiText==='Catch letters...')placeholder=o;});assert.equal(placeholder.children.length,1,'uniform text takes a single draw');
});

test('deferred frame sync updates the clock once in animate while direct sync remains immediate',supported,async()=>{
  const {ui,game,view,sync}=await create();game.start(0);sync();
  let timer;ui.scene.traverse(o=>{if(o.userData.roundTimeBar)timer=o;});const full=timer.scale.x;
  game.remaining=30;ui.sync(game,view,true);assert.equal(timer.scale.x,full);
  ui.animate(100,.016,game);assert.equal(timer.scale.x,.5);
  game.remaining=15;sync();assert.equal(timer.scale.x,.25);
});

test('practice exposes only its guided action and its coach card blocks underlying tiles',supported,async()=>{
  const {ui,game,view,sync,hit}=await create();game.start(0);game.select('C',0);
  const {viewportLayout}=await import('../three/layout.mjs');ui.resize(viewportLayout(360,640));
  view.tutorial={id:'tap',title:'Tap to create words',detail:'Tap the highlighted letter.',target:'tile',expectedLetter:'A',stepIndex:0,stepCount:7,completed:false,canContinue:false,visualTime:0,highlightRect:{x:150,y:330,w:60,h:60}};sync();
  assert.deepEqual(ui.buttons().map(c=>c.id),['tutorial-exit']);
  assert.equal(hit(315,596),null,'submit cannot bypass a guided selection');
  assert.equal(ui.obscures(180,200),true,'card prevents accidental catches through its surface');
  assert.equal(ui.obscures(180,360),false,'highlighted tile remains reachable');
  assert.match(ui.description(game,view),/Step 1 of 7.*Highlighted letter: A/);
  view.tutorial={...view.tutorial,id:'submit',title:'Submit when ready',target:'submit',highlightRect:{x:76,y:554,w:262,h:54}};sync();
  assert.deepEqual(ui.buttons().map(c=>c.id),['submit','tutorial-exit']);
  assert.equal(hit(315,596),'submit');assert.equal(hit(45,580),null);
  view.tutorial=null;sync();assert.deepEqual(ui.buttons().map(c=>c.id),['pause','submit','undo']);
  assert.equal(ui.obscures(180,200),false);
});

test('practice completion advances without Next controls and only its final step offers play',supported,async()=>{
  const {ui,game,view,sync,hit}=await create();game.start(0);
  view.tutorial={id:'tap',title:'Tap to create words',detail:'You made CAT!',target:'',stepIndex:0,stepCount:7,completed:true,canContinue:false,visualTime:2};sync();
  assert.deepEqual(ui.buttons().map(c=>c.id),['tutorial-exit']);
  assert.doesNotMatch(visibleText(ui).join(' '),/Next|Follow the glow/);
  view.tutorial={...view.tutorial,id:'ready',title:'Get the highest score!',detail:'You are ready.',stepIndex:6,canContinue:true,nextLabel:'Let’s Play'};sync();
  assert.deepEqual(ui.buttons().map(c=>c.id),['tutorial-exit','tutorial-next']);
  assert.equal(hit(180,245),'tutorial-next');
  assert.match(visibleText(ui).join(' '),/Let’s Play/);
});

test('desktop keyboard hints use the platform labels and disappear entirely on phones',supported,async()=>{
  const {ui,game,view,sync,THREE}=await create();game.start(0);view.keyboardHints={submit:'Return',clear:'Delete'};sync();
  assert.match(visibleText(ui).join(' '),/Delete Return/);
  let hints;ui.scene.traverse(o=>{if(o.userData.keyboardHints)hints=o;});assert.ok(hints);
  ui.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(hints);
  assert.ok(bounds.min.y>=-320&&bounds.max.y<-300,'key hints fit below the tray inside the canvas');
  assert.deepEqual(ui.buttons().map(c=>c.id),['pause'],'keycaps do not add misleading hit targets');
  view.keyboardHints={submit:'Enter',clear:'Backspace'};sync();assert.match(visibleText(ui).join(' '),/Backspace Enter/);
  assert.doesNotMatch(visibleText(ui).join(' '),/Return|Delete/);
  view.keyboardHints=null;sync();assert.doesNotMatch(visibleText(ui).join(' '),/Return|Delete|Enter|Backspace/);
});
