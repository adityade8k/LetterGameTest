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
  const font=new FontLoader().parse(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vendor/three/helvetiker_bold.typeface.json'),'utf8')));
  const game=new WordGame(['CAT','DOG','BIRD','APPLE','ORANGE','FLOWERS','ELEPHANT','TREES'],overrides);
  const ui=createUI(font,{...game.config,...uiOverrides},true);ui.resize({width:360,height:640,left:0,top:0,bottom:0});
  const words=['CAT','DOG','BIRD','APPLE','ORANGE','FLOWERS','ELEPHANT','TREES'];
  const view={mode:'',collectionPage:0,feedback:'',feedbackKind:'',focus:'',hover:'',best:0,roundBest:0,settings:{effects:false,music:false,haptics:false,reducedMotion:true},book:{totalWords:words.length,entries:words.map((word,i)=>({word,length:word.length,firstSeen:100+i,lastSeen:100+i,timesPlayed:i+1,bestPoints:10,withoutBlanks:true})),stats:{roundsPlayed:1,totalWordsPlayed:8},lengthCounts:{3:2,4:1,5:2,6:1,7:1,8:1},goals:[],storageStatus:{state:'saved'}}};
  const camera=new THREE.OrthographicCamera(-180,180,320,-320,.1,100);camera.position.z=60;camera.updateMatrixWorld(true);
  const raycaster=new THREE.Raycaster();
  const hit=(x,y)=>{ui.scene.updateMatrixWorld(true);raycaster.setFromCamera(new THREE.Vector2(x/180-1,1-y/320),camera);return ui.hit(raycaster);};
  const sync=()=>ui.sync(game,view);sync();
  return {ui,game,view,hit,sync,THREE,camera};
}

test('home meshes open distinct screens and modal screens expose no underlying controls',supported,async()=>{
  const {ui,view,hit,sync}=await create();
  assert.equal(hit(180,447),'start');assert.equal(hit(100,502),'wordbook');assert.equal(hit(260,552),'settings');
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

test('results show new-discovery navigation only when discoveries exist',supported,async()=>{
  const {ui,game,view,hit,sync}=await create();game.phase='over';view.mode='over';game.words=['APPLE'];view.roundSummary={roundId:'a',newWords:['APPLE'],newWordCount:1,score:10,wordCount:1};sync();
  assert.match(ui.description(game,view),/1 word\. Best 0\. 1 new word:/);assert.equal(hit(180,513),'results-new');assert.equal(hit(180,456),'start');assert.equal(hit(180,566),'stats');assert.equal(hit(284,566),'home');
  view.roundSummary={roundId:'b',newWords:[],newWordCount:0};sync();assert.equal(hit(180,513),'wordbook');
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
  assert.match(ui.description({},view),/Community comparison unavailable/);
  view.book.stats.personal.observedSeconds=1200;view.book.stats.personal.complete=true;sync();assert.match(ui.description({},view),/Full window/);
});

test('configured success duration changes visual settling without delaying gameplay',supported,async()=>{
  const exercise=async duration=>{
    const {ui,game,view,sync}=await create({},{engagement:{successSeconds:duration}});ui.setReducedMotion(false);game.start(0);
    for(const letter of 'CAT')game.select(letter,0);const result=game.submit(0);ui.celebrate(result,game);sync();
    let card;ui.scene.traverse(object=>{if(object.isGroup&&object.position.x===22&&object.position.y===-579)card=object;});assert.ok(card);
    ui.animate(1000,.3,game);assert.equal(game.score,result.points);assert.equal(game.current,'');
    return card.position.y;
  };
  assert.equal(await exercise(.1),-579);
  assert.ok(await exercise(1)>-579);
  assert.ok(Number.isFinite(await exercise(NaN)));
  assert.ok(Number.isFinite(await exercise(-1)));
});

test('wildcard reveal respects the configured discovery duration',supported,async()=>{
  const {ui,game,sync}=await create({engagement:{discoverySeconds:1.2}});game.start(0);
  for(const letter of '?AT')game.select(letter,0);const result=game.submit(0);ui.celebrate(result,game);sync();
  const goldCount=()=>{let count=0;ui.scene.traverse(object=>{if(!object.isMesh||object.material.uniforms?.lightTone?.value.getHexString()!=='fed276')return;for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return;count++;});return count;};
  assert.equal(goldCount(),1);ui.animate(1000,.7,game);sync();assert.equal(goldCount(),1);
  ui.animate(1600,.6,game);sync();assert.equal(goldCount(),0);
});

test('controls stay within narrow mobile canvases and their safe areas',supported,async()=>{
  const {viewportLayout}=await import('../three/layout.mjs');
  const {ui,view,sync,THREE,camera}=await create();
  for(const [pixelWidth,pixelHeight,safeTop,safeBottom] of [[320,568,0,0],[320,480,24,16],[390,844,47,34]]){
    const layout=viewportLayout(pixelWidth,pixelHeight,safeTop,safeBottom);ui.resize(layout);
    camera.left=-layout.width/2;camera.right=layout.width/2;camera.top=layout.height/2;camera.bottom=-layout.height/2;camera.updateProjectionMatrix();
    for(const mode of ['','settings','wordbook','search','word-detail','stats','goals','help','over']){
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
