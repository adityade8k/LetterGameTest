import { DESIGN } from './design.js';
import { createScene } from './scene.js';
import { prepareTile, settleTiles, stepTiles } from './physics.mjs';
import { DifficultyCurve } from './difficulty.mjs';
import { PrefixLetterSupply, FrequencyLetterSupply } from './letter-supply.mjs';
import { spawnPosition, fieldPosition, openingFeed, supplyProfile, DensityRamp, ArrivalClock, DeferredRefills } from './spawn.mjs';
import { exposedPosition } from './layout.mjs';
import { ProgressStore, STORAGE_KEY } from '../progress.mjs';
import { createAudio } from './audio.mjs';
import { TutorialSession } from './tutorial.mjs';
import { keyboardHints } from './keyboard-hints.mjs';

// Only the WebGL canvas is attached to the page. The interface and its hit
// targets live in ui.js; the original dictionary and game rules stay shared.
if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
const game=new Letterfall.WordGame(LETTERFALL_WORDS);
const config=game.config;
const difficulty=new DifficultyCurve(config.difficulty);
const refills=new DeferredRefills();
const densityRamp=new DensityRamp(config.density),arrivals=new ArrivalClock();
const letterSupply=new PrefixLetterSupply(game.dictionary,config.wordAssist);
const frequencySupply=new FrequencyLetterSupply(config.letterFrequency);
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const finePointerPreference=matchMedia('(any-pointer: fine)'),hoverPreference=matchMedia('(any-hover: hover)');
const desktopKeys=()=>keyboardHints({platform:navigator.userAgentData?.platform||navigator.platform,userAgent:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints,finePointer:finePointerPreference.matches,hover:hoverPreference.matches});
let reducedMotion=motionPreference.matches;
const size=config.tiles.mobileSize;
let width=DESIGN.width,height=DESIGN.height,layout;
const tileShape={pitchOffset:0,yawOffset:0,halfDepth:DESIGN.tile.depth/2+DESIGN.tile.bevel+DESIGN.tile.letterDepth+2};
const storageKey='letterfall.best.points.v2';
let scene,tiles=[],hover=null,lastLabel=0,lastPhase='ready',feedbackUntil=0;
let best=0,roundBest=0,resumeAfterMenu=false,roundId='',activeOffset=0,bestChain=0,lastCheckpoint=0,lastLowWarning=-Infinity;
const menuStack=[];
let tutorial=null,tutorialReturn=null;
let storage;
try{storage=localStorage;}catch{/* Private browsers may deny storage access. */}
const settings={effects:true,music:false,haptics:false,reducedMotion};
try{const saved=JSON.parse(storage?.getItem('clttr.settings.v1')||'null');if(saved)for(const key of Object.keys(settings))if(typeof saved[key]==='boolean')settings[key]=saved[key];}catch{}
reducedMotion=settings.reducedMotion;
const audio=createAudio(settings);
let audioReady=Promise.resolve(false);
function sound(kind,info){void audioReady.then(()=>audio.play(kind,info));}
const ruleSignature=JSON.stringify(Object.fromEntries(Object.entries(config).filter(([key])=>!['feedback','celebration','engagement'].includes(key))));
let ruleHash=2166136261;for(const char of ruleSignature)ruleHash=Math.imul(ruleHash^char.charCodeAt(0),16777619)>>>0;
const progress=new ProgressStore(storage,{ruleVersion:`clttr-${ruleHash.toString(16)}`,dictionaryVersion:'bundled-english-v1'});
const view={mode:'',collectionPage:0,feedback:'',feedbackKind:'',focus:'',hover:'',best:0,roundBest:0,soundOn:settings.effects,
  keyboardHints:desktopKeys(),settings,book:progress.snapshot(),roundSummary:null,wordbookFilter:'all',wordbookSort:'recent',wordbookQuery:'',wordbookPage:0,wordbookOnlyNew:false,wordDetail:'',menuReturn:'',statsView:'lifetime'};
for(const preference of [finePointerPreference,hoverPreference])preference.addEventListener?.('change',()=>{view.keyboardHints=desktopKeys();if(scene){sync();updateLabel();}});
try{const saved=Number(localStorage.getItem(storageKey));if(Number.isSafeInteger(saved)&&saved>=0)best=saved;}catch{/* Storage is optional. */}
best=progress.importBestScore(best);view.book=progress.snapshot();
const format=value=>String(Number(value.toFixed(2)));
function feedback(message,kind=''){
  view.feedback=message;view.feedbackKind=kind;feedbackUntil=performance.now()+config.feedback.durationSeconds*1000;
}
function refreshBook(){view.book=progress.snapshot();}
function checkpoint(){
  if(!roundId)return;
  progress.setActiveSeconds(activeOffset+game.elapsed,{roundId,activeSeconds:game.elapsed});lastCheckpoint=game.elapsed;refreshBook();
}
function saveSettings(){
  reducedMotion=settings.reducedMotion;audio.setSettings(settings);scene?.setReducedMotion(reducedMotion);if(tutorial)tutorial.reducedMotion=reducedMotion;
  try{storage?.setItem('clttr.settings.v1',JSON.stringify(settings));}catch{}
  audioReady=audio.unlock();
}
// Another tab may add words while this round is paused or a menu is open.
// Refresh is read-only, so storage notifications cannot form a save loop.
let storageRefresh;
window.addEventListener('storage',event=>{
  if(event.storageArea!==storage||!event.key?.startsWith(STORAGE_KEY))return;
  clearTimeout(storageRefresh);
  storageRefresh=setTimeout(()=>{
    progress.refreshFromStorage();refreshBook();best=Math.max(best,view.book.stats.bestScore);
    if(scene){sync();updateLabel();}
  },60);
});
function finishRound(abandoned=false){
  if(!roundId)return;
  checkpoint();
  view.roundSummary=progress.finishRound({roundId,score:game.score,activeSeconds:game.elapsed,bestChain,mistakes:game.mistakes,words:[...game.words],abandoned});
  refreshBook();
}
function makeTile(letter, x, y,fade=false) {
  const blank=letter==='?',traits=blank?{bonus:false,grenade:false,effect:null}:game.rollTileTraits();
  return prepareTile({ ...tileShape, kind:'letter', letter,blank,x,y,...traits,...(fade?{bornAt:game.elapsed}:{}),
    tilt:0 },config);
}
function currentSupply(){return supplyProfile(layout,size,config,densityRamp.words);}
function seed() {
  const supply=currentSupply(),count=supply.target;
  const blanks=config.wildcards.chance>0?config.wildcards.openingTiles:0;
  const opening=LetterfallOpening.lettersFor(game.dictionary,Math.max(7,count-blanks),()=>frequencySupply.next());
  // Place the guaranteed word first, so a crowded viewport never sacrifices it.
  const remaining=[...opening.letters],required=[...opening.words[0]];
  for(const letter of required)remaining.splice(remaining.indexOf(letter),1);
  tiles=[];
  for(const letter of [...required,...Array(blanks).fill('?'),...remaining]){
    const position=fieldPosition(tiles,layout,size);
    if(position)tiles.push(makeTile(letter,position.x,position.y));
  }
  for(const position of openingFeed(tiles,layout,size,config,Math.random,supply.fraction)){
    tiles.push(makeTile(nextLetter(),position.x,position.y));
  }
  settleTiles(tiles,width,size,config.physics);
}
function nextLetter() {
  if(Math.random()<config.wildcards.chance)return '?';
  return letterSupply.next(game.current,game.used,()=>frequencySupply.next());
}
function updateLayout(){
  if(layout===scene.layout)return;
  const old=layout;layout=scene.layout;width=layout.width;height=layout.height;
  if(old){for(const tile of tiles){tile.x*=width/old.width;tile.y*=height/old.height;}}
  settleTiles(tiles,width,size,config.physics);
  tutorial?.resize(layout);
}
function exposedTile(tile){return exposedPosition(tile.x,tile.y,layout,size/2)&&!scene.ui.obscures(tile.x,tile.y,size/2);}
function topEntry(){
  const limit=currentSupply().limit;
  return spawnPosition(tiles,width,size,{...config,falling:{...config.falling,letterLimit:limit}});
}
function refillChoices(afterPick=false){
  if(game.phase!=='running')return;
  const visible=tiles.filter(tile=>tile.kind==='letter'&&exposedTile(tile)).length;
  const budget=refills.budget(visible,currentSupply().target,afterPick);
  for(let i=0;i<budget;i++){
    // Replacements queue at the same top edge as normal drops, never in the field.
    const position=topEntry();if(!position)break;
    tiles.push(makeTile(nextLetter(),position.x,position.y,true));
    refills.placed();
  }
  settleTiles(tiles,width,size,config.physics);
}
function spawn() {
  // One arrival per opportunity keeps the stream staggered instead of batching
  // maintenance replacements with a second ordinary drop.
  const position=topEntry();
  if(position){tiles.push(makeTile(nextLetter(),position.x,position.y));refills.placed();return true;}
  return false;
}
function handle(result){
  if(!result||result.type==='ignored')return;
  if(result.type==='word'){
    if(game.score>best){best=game.score;try{localStorage.setItem(storageKey,String(best));}catch{}}
    view.feedback='';view.feedbackKind='';feedbackUntil=0;
    const previousLongest=view.book.stats?.longestWord||'';
    const discovery=progress.recordWord(result,{roundId,eventId:`${roundId}:${result.wordIndex}`,activeSeconds:result.activeSeconds});
    bestChain=Math.max(bestChain,result.comboCount||0);refreshBook();
    result.isNew=discovery.isNew;result.newWithoutBlanks=discovery.newWithoutBlanks;
    result.isRecord=result.word.length>(typeof previousLongest==='string'?previousLongest.length:previousLongest.length||0);
    result.milestone=discovery.milestone;
    scene.ui.celebrate(result,game);sound('word',{length:result.word.length,isNew:result.isNew,isRecord:result.isRecord,blankCount:result.blankCount});
    if(result.scoreMultiplier>1&&result.points>0)sound('gold');
  }else if(result.type==='repeat'){
    feedback(`${result.word} / Already found / +0`,'repeat');sound('repeat');
  }else if(result.type==='penalty'){
    const reason={clear:'Word cleared',timeout:'Word incomplete',spelling:'No matching word',incomplete:'Word incomplete'}[result.reason];
    const fasterDrain=result.reason!=='timeout'&&result.timerDrainMultiplier>1&&game.phase==='running'
      ?` / Timer ${Math.round((result.timerDrainMultiplier-1)*100)}% faster`:'';
    feedback(`${reason} / -${format(result.penalty)}s${fasterDrain}`,'bad');sound(result.reason==='clear'?'clear':'invalid');
  }else if(result.type==='effect'){
    if(result.effect==='smoke'){scene.releaseSmoke(result.origin);feedback('Smoke!','smoke');sound('grenade');}
    else{view.feedback='';view.feedbackKind='';feedbackUntil=0;sound(result.effect==='fire'?'fire':'hourglass');}
  }
  else if(result.type==='letter')sound('letter',{length:game.current.length});
  sync();
}
function visibleTiles(){return tiles.filter(tile=>exposedTile(tile)&&(tile.bornAt===undefined||game.elapsed-tile.bornAt>=config.falling.replacementFadeSeconds));}
function pick(tile){
  if(tutorial){
    view.focus='';view.hover='';
    const results=tutorial.pick(tile);if(!results.length)sound('miss');
    if(results.some(result=>['letter','effect','penalty'].includes(result.type)&&result.consumed!==false)){scene.burst(tile,{target:'tray',index:Math.max(0,tutorial.game.current.length-1)});hover=null;}
    practiceFeedback(results);sync();updateLabel();return;
  }
  if(game.phase!=='running'||view.mode)return;
  if(tile.bornAt!==undefined&&game.elapsed-tile.bornAt<config.falling.replacementFadeSeconds)return;
  view.focus='';
  const result=game.select(tile.letter,performance.now(),tile);
  if(result.consumed!==false&&['letter','penalty','effect'].includes(result.type)){
    tiles=tiles.filter(item=>item!==tile);scene.burst(tile,{target:'tray',index:Math.max(0,game.current.length-1)});hover=null;
    if(tile.kind==='letter'&&game.phase==='running')refills.picked();
  }
  handle(result);if(result.tileEffect)handle({type:'effect',...result.tileEffect,origin:{x:tile.x,y:tile.y}});refillChoices(true);updateLabel();
}
function sync(updateUI=true){
  audio.setActive(!document.hidden);
  if(tutorial){
    audio.setAmbientActive(false);syncTutorialView();
    if(updateUI)scene?.ui.sync(tutorial.game,view);
    return;
  }
  view.best=best;view.roundBest=roundBest;view.soundOn=settings.effects;
  if(game.phase!==lastPhase){
    lastPhase=game.phase;
    if(game.phase==='over'){
      finishRound();tiles=tiles.filter(tile=>tile.kind!=='hourglass');scene?.reset();view.mode='over';view.focus='start';sound('gameover');
    }
  }
  audio.setAmbientActive(game.phase==='running'&&!view.mode);
  if(updateUI)scene?.ui.sync(game,view);
}
function updateLabel(){
  if(!scene)return;
  const labels=scene.ui.buttons();
  if(tutorial){
    const label=`${scene.ui.description(tutorial.game,view)} Controls: ${labels.map(c=>c.label).join('; ')}.${view.keyboardHints?` Tab to focus a control; ${view.keyboardHints.submit} to activate. Type the highlighted letter or tap its tile. ${view.keyboardHints.clear} clears. Escape exits practice.`:''}`;
    if(scene.canvas.getAttribute('aria-label')!==label)scene.canvas.setAttribute('aria-label',label);
    return;
  }
  const letters=visibleTiles().map(tile=>tile.blank?'blank wildcard (0 points)':`${tile.letter}${tile.effect==='smoke'?' (magenta, smoke)':tile.effect==='hourglass'?' (ice, slow time)':tile.effect==='fire'?` (fire, ${config.fire.worldTimeScale} times faster tiles)`:''}${tile.bonus?' (gold, double score)':''}`).join(', ');
  const effects=`${game.effects.fire>0?` Faster tiles: ${Math.ceil(game.effects.fire)} seconds. Timers remain at normal speed.`:''}${game.effects.hourglass>0?` Slow time: ${Math.ceil(game.effects.hourglass)} seconds.`:''}${game.effects.smoke>0?` Smoke: ${Math.ceil(game.effects.smoke)} seconds.`:''}`;
  const description=scene.ui.description(game,view);
  const label=`${description}${effects} ${view.mode||game.phase==='ready'?'':`Visible tiles: ${letters}. `}Controls: ${labels.map(c=>c.label).join('; ')}. ${view.focus?`Focused control: ${labels.find(c=>c.id===view.focus)?.label||''}. `:''}${view.keyboardHints?`Tab to focus a control, ${view.keyboardHints.submit} or Space to activate. Letter keys catch matching tiles; ? or * catches a blank wildcard; ${view.keyboardHints.submit} submits; ${view.keyboardHints.clear} clears the whole word; Escape pauses or resumes.`:''}`;
  if(scene.canvas.getAttribute('aria-label')!==label)scene.canvas.setAttribute('aria-label',label);
}
function begin(){
  if(tutorial)endTutorial(false);
  if(roundId&&game.phase!=='over')finishRound(true);
  roundBest=best;game.start(performance.now());difficulty.reset();scene.reset();refills.reset();densityRamp.reset();arrivals.reset();hover=null;updateLayout();seed();
  roundId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeOffset=view.book.stats?.activeSeconds||0;bestChain=0;lastCheckpoint=0;lastLowWarning=-Infinity;
  progress.beginRound(roundId);refreshBook();
  Object.assign(view,{mode:'',focus:'',hover:'',collectionPage:0,feedback:'',feedbackKind:'',roundSummary:null});feedbackUntil=0;resumeAfterMenu=false;menuStack.length=0;
  sync();updateLabel();scene.canvas.focus({preventScroll:true});sound('start');
}
function togglePause(){
  if(tutorial)return;
  if(game.phase==='running'){
    handle(game.pause(performance.now()));
    checkpoint();if(game.phase==='paused'){view.mode='paused';view.focus='menu';sound('pause');}
  }else if(game.phase==='paused'){
    game.resume(performance.now());view.mode='';view.focus='';resumeAfterMenu=false;sound('resume');
  }
  sync();updateLabel();
}
function openMenu(mode){
  const shouldResume=game.phase==='running';
  if(shouldResume)handle(game.pause(performance.now()));
  checkpoint();
  if(shouldResume&&game.phase==='over')return;
  menuStack.push({mode:view.mode,resume:shouldResume});view.menuReturn=view.mode;
  view.mode=mode;view.focus='';view.collectionPage=0;sync();updateLabel();
}
function closeMenu(){
  sound('ui');
  const previous=menuStack.pop();
  view.mode=previous?previous.mode:(game.phase==='over'?'over':game.phase==='paused'?'paused':'');view.focus='';
  if(previous?.resume)game.resume(performance.now());
  view.menuReturn=menuStack.at(-1)?.mode||'';sync();updateLabel();
}
function home(){
  if(roundId&&game.phase!=='over')finishRound(true);
  game.reset();roundId='';scene.reset();menuStack.length=0;resumeAfterMenu=false;
  Object.assign(view,{mode:'',focus:'',hover:'',feedback:'',feedbackKind:''});
  tiles=[];
  sync();updateLabel();
}
function syncTutorialView(){
  const state=tutorial.state;
  let highlightRect=null;
  if(state.target==='tile'){
    const tile=tutorial.tiles.find(tile=>tile.id===state.targetTileId);
    if(tile)highlightRect={x:tile.x-layout.left-size/2-3,y:tile.y-layout.top-size/2-3,w:size+6,h:size+6};
  }else if(state.target==='submit')highlightRect={x:76,y:layout.height-layout.bottom-layout.top-86,w:262,h:54};
  else if(state.target==='undo')highlightRect={x:22,y:layout.height-layout.bottom-layout.top-81,w:46,h:44};
  else if(state.target==='timer')highlightRect={x:18,y:60,w:324,h:14};
  else if(state.target==='score')highlightRect={x:18,y:10,w:132,h:32};
  view.tutorial={...state,highlightRect,nextLabel:state.id==='ready'&&(tutorialReturn?.mode==='paused'||tutorialReturn?.resume)?'Back to Game':state.nextLabel};
}
function practiceFeedback(results=[]){
  for(const result of results){
    if(result.type==='tutorial-step'){scene.reset();view.feedback='';view.feedbackKind='';view.focus='';hover=null;sound('ui');continue;}
    if(result.type==='word'){
      scene.ui.celebrate(result,tutorial.game);sound('word',{length:result.word.length});
      if(result.scoreMultiplier>1&&result.points>0)sound('gold');
    }else if(result.type==='letter')sound('letter',{length:tutorial.game.current.length});
    else if(result.type==='penalty')sound('clear');
    const effect=result.tileEffect?.effect||(result.type==='effect'?result.effect:null);
    if(effect){if(effect==='smoke')scene.releaseSmoke();sound(effect==='smoke'?'grenade':effect==='fire'?'fire':'hourglass');}
  }
}
function startTutorial(){
  const resume=game.phase==='running';
  if(resume)handle(game.pause(performance.now()));
  checkpoint();
  tutorialReturn={mode:view.mode,focus:view.focus,feedback:view.feedback,feedbackKind:view.feedbackKind,resume:resume&&game.phase==='paused'};
  tutorial=new TutorialSession(Letterfall.WordGame,config);tutorial.reducedMotion=reducedMotion;tutorial.resize(layout);
  scene.reset();view.mode='';view.focus='';view.hover='';view.feedback='';view.feedbackKind='';hover=null;
  sync();updateLabel();scene.canvas.focus({preventScroll:true});
}
function endTutorial(update=true){
  if(!tutorial)return;
  const previous=tutorialReturn;tutorial=null;tutorialReturn=null;view.tutorial=null;
  scene.reset();hover=null;Object.assign(view,{mode:previous.mode,focus:previous.focus,feedback:previous.feedback,feedbackKind:previous.feedbackKind,hover:''});
  if(previous.resume)game.resume(performance.now());
  // Recreate an interrupted gas visual at its saved age when returning to a round.
  if(game.effects.smoke>0)scene.releaseSmoke();
  if(update){sync();updateLabel();}
}
function queryInput(key){
  sound('ui');
  if(key==='done'){closeMenu();return;}
  if(key==='backspace')view.wordbookQuery=view.wordbookQuery.slice(0,-1);
  else if(/^[A-Z]$/i.test(key)&&view.wordbookQuery.length<32)view.wordbookQuery+=key.toUpperCase();
  view.wordbookPage=0;sync();updateLabel();
}
function act(action){
  if(tutorial){
    scene.ui.press(action,performance.now());view.focus='';view.hover='';
    if(action==='tutorial-exit'){sound('ui');endTutorial();return;}
    if(!['tutorial-next','submit','undo'].includes(action))return;
    const previous=tutorial.state.id,results=tutorial.act(action);
    if(results.some(result=>result.type==='tutorial-complete')){const resume=tutorialReturn?.mode==='paused'||tutorialReturn?.resume;endTutorial();if(!resume)begin();else if(game.phase==='paused')togglePause();return;}
    if(tutorial.state.id!==previous){scene.reset();view.feedback='';view.feedbackKind='';sound('ui');}
    practiceFeedback(results);sync();updateLabel();return;
  }
  scene.ui.press(action,performance.now());
  view.hover='';view.focus='';hover=null;
  const [type,value]=action.split(':');
  if(!['start','restart','pause','resume','submit','undo','menu','sound','key'].includes(type))sound('ui');
  if(type==='book-filter'){view.wordbookFilter=value;view.wordbookPage=0;}
  else if(type==='stats-view'){view.statsView=value;}
  else if(type==='book-sort'){view.wordbookSort=value;view.wordbookPage=0;}
  else if(type==='book-word'){view.wordDetail=value;openMenu('word-detail');return;}
  else if(type==='setting'&&Object.hasOwn(settings,value)){settings[value]=!settings[value];saveSettings();}
  else if(type==='goal'){progress.selectGoal(value==='none'?null:value);refreshBook();}
  else if(type==='key'){queryInput(value);return;}
  else switch(action){
    case 'start':case 'restart':begin();return;
    case 'home':home();return;
    case 'pause':case 'resume':togglePause();return;
    case 'submit':if(!game.current&&game.phase==='running'){feedback('Catch a letter first.');sound('miss');}else handle(game.submit(performance.now()));break;
    case 'undo':if(!game.current&&game.phase==='running'){feedback('Your tray is empty.');sound('miss');}else handle(game.undo(performance.now()));break;
    case 'sound':settings.effects=!settings.effects;saveSettings();sound('letter');break;
    case 'help':startTutorial();return;
    case 'settings':case 'stats':case 'goals':openMenu(action);return;
    case 'wordbook':
      view.wordbookOnlyNew=false;view.wordbookPage=0;view.wordbookQuery='';view.wordbookFilter='all';openMenu('wordbook');return;
    case 'results-new':
      view.wordbookOnlyNew=true;view.wordbookPage=0;view.wordbookQuery='';view.wordbookFilter='all';openMenu('wordbook');return;
    case 'book-query':openMenu('search');return;
    case 'book-clear-query':view.wordbookQuery='';view.wordbookPage=0;break;
    case 'book-prev':view.wordbookPage=Math.max(0,view.wordbookPage-1);break;
    case 'book-next':view.wordbookPage=Math.min((scene.ui.wordbookPages?.()||1)-1,view.wordbookPage+1);break;
    case 'book-back':closeMenu();return;
    case 'collection':if(game.wordCount)openMenu('collection');return;
    case 'previous':view.collectionPage=Math.max(0,view.collectionPage-1);view.focus='previous';break;
    case 'next':view.collectionPage=Math.min(scene.ui.collectionPages()-1,view.collectionPage+1);view.focus='next';break;
    case 'menu':
      if(view.mode==='over'){begin();return;}
      if(view.mode==='paused'){togglePause();return;}
      closeMenu();return;
  }
  sync();updateLabel();
}
document.addEventListener('visibilitychange',()=>{audio.setActive(!document.hidden);if(document.hidden&&game.phase==='running')togglePause();else sync();});
window.addEventListener('pagehide',()=>checkpoint());
motionPreference.addEventListener?.('change',event=>{settings.reducedMotion=event.matches;saveSettings();});
window.addEventListener('keydown',event=>{
  if(!scene||event.ctrlKey||event.metaKey||event.altKey)return;
  audioReady=audio.unlock();
  const clearKey=event.key==='Backspace'||event.key==='Delete',submitKey=event.key==='Enter'||event.key==='Return';
  if(view.mode==='search'&&(/^[a-z]$/i.test(event.key)||clearKey||submitKey)){event.preventDefault();queryInput(clearKey?'backspace':submitKey?'done':event.key);return;}
  if(event.key==='Tab'){
    event.preventDefault();sound('ui');view.focus=scene.ui.focusNext(view.focus,event.shiftKey?-1:1);scene.canvas.focus({preventScroll:true});sync();updateLabel();return;
  }
  if(event.key==='Escape'){
    event.preventDefault();if(tutorial){act('tutorial-exit');return;}if(view.mode&&view.mode!=='paused'&&view.mode!=='over')closeMenu();else if(game.phase!=='over')togglePause();return;
  }
  if(submitKey||event.key===' '){
    event.preventDefault();
    if(view.focus&&scene.ui.buttons().some(c=>c.id===view.focus))act(view.focus);
    else if(tutorial){if(tutorial.state.canContinue)act('tutorial-next');else if(tutorial.state.target==='submit')act('submit');}
    else if(view.mode)act('menu');
    else if(game.phase==='ready')begin();
    else if(game.phase==='running'){if(submitKey)act('submit');else togglePause();}
    return;
  }
  if(tutorial){
    if(clearKey){event.preventDefault();act('undo');}
    else if(/^[a-z]$/i.test(event.key)){event.preventDefault();const tile=tutorial.tiles.find(t=>t.letter===event.key.toUpperCase()&&t.id===tutorial.state.targetTileId);if(tile)pick(tile);else sound('miss');}
    return;
  }
  if(view.mode||game.phase!=='running')return;
  if(clearKey){event.preventDefault();act('undo');}
  else if(event.key==='?'||event.key==='*'){event.preventDefault();const tile=visibleTiles().find(t=>t.blank);if(tile)pick(tile);else{feedback('No blank in reach yet.');sound('miss');}}
  else if(/^[a-z]$/i.test(event.key)){
    event.preventDefault();const tile=visibleTiles().filter(t=>t.letter===event.key.toUpperCase()).sort((a,b)=>b.y-a.y)[0];
    if(tile)pick(tile);else{feedback(`No ${event.key.toUpperCase()} in reach yet.`);sound('miss');}
  }
});
let pendingScene;
try{
  pendingScene=await createScene(document.getElementById('scene'),config,reducedMotion);
  pendingScene.setReducedMotion(reducedMotion);
  // Warm the real menu before the loader reaches 100%. Keep inputs blocked
  // until its final frame is complete, then reuse the same WebGL canvas.
  pendingScene.render([],game,0,performance.now(),null,view);
  await pendingScene.finishLoading();
  scene=pendingScene;pendingScene=null;
  updateLayout();
  scene.canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();audioReady=audio.unlock();scene.canvas.focus({preventScroll:true});view.focus='';
    scene.tapFeedback(event.clientX,event.clientY);
    const hit=scene.hit(event.clientX,event.clientY);
    if(hit?.action)act(hit.action);else if(hit?.tile)pick(hit.tile);else sound('miss');
  });
  scene.canvas.addEventListener('pointermove',event=>{
    const hit=scene.hit(event.clientX,event.clientY);view.hover=hit?.action||'';
    hover=(tutorial||game.phase==='running')&&!view.mode?hit?.tile||null:null;
    scene.canvas.style.cursor=view.hover||hover?'pointer':'default';
  });
  scene.canvas.addEventListener('pointerleave',()=>{hover=null;view.hover='';});
  scene.canvas.addEventListener('blur',()=>{view.focus='';});
  scene.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(game.phase==='running')togglePause();scene.canvas.setAttribute('aria-label','The 3D scene needs a refresh. Your best score and saved Wordbook are safe.');});
  scene.canvas.addEventListener('webglcontextrestored',()=>location.reload());
  tiles=[];
  sync();updateLabel();let previous=performance.now();
  function frame(now){
    const dt=Math.min((now-previous)/1000,.05);previous=now;updateLayout();
    if(tutorial){
      practiceFeedback(tutorial.advance(document.hidden?0:dt));sync(false);
      scene.render(tutorial.tiles,tutorial.game,document.hidden?0:dt,now,hover,view);
      if(now-lastLabel>250){updateLabel();lastLabel=now;}
      requestAnimationFrame(frame);return;
    }
    handle(game.advance(now));
    if(game.phase==='running'){
      if(game.elapsed-lastCheckpoint>=10)checkpoint();
      if(game.remaining<=config.timer.lowTimeSeconds&&game.elapsed-lastLowWarning>=config.engagement.lowWarningCooldownSeconds){sound('lowtime');lastLowWarning=game.elapsed;}
      const worldDt=dt*game.worldTimeScale;
      densityRamp.advance(worldDt,game.wordCount);
      stepTiles(tiles,worldDt,{width,size,speed:config.falling.pixelsPerSecond,config,reducedMotion,difficultyLevel:difficulty.valueAt(game.elapsed)});
      tiles=tiles.filter(tile=>tile.y<height+size);
      const spawnSeconds=currentSupply().spawnSeconds;
      if(arrivals.advance(worldDt,spawnSeconds)&&spawn())arrivals.placed();
    }
    if(now>feedbackUntil){view.feedback='';view.feedbackKind='';}
    // The renderer synchronizes the mesh UI once, after world updates.
    sync(false);scene.render(tiles,game,dt,now,hover,view);
    if(now-lastLabel>250){updateLabel();lastLabel=now;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}catch(error){
  console.error(error);
  await pendingScene?.failLoading('CLTTR could not load. Please refresh to try again.');
  const host=document.getElementById('scene');
  host.setAttribute('aria-label','CLTTR could not load. Refresh in a browser with WebGL enabled.');
  const notice=document.createElement('p');notice.className='load-error';notice.setAttribute('role','alert');
  notice.textContent='Couldn’t load CLTTR. Please refresh to try again.';host.append(notice);
  document.title='CLTTR — unable to load the 3D scene';
}
