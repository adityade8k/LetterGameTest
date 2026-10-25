import { DESIGN } from './design.js';
import { createScene } from './scene.js';
import { prepareTile, settleTiles, stepTiles } from './physics.mjs';
import { DifficultyCurve } from './difficulty.mjs';
import { PrefixLetterSupply, FrequencyLetterSupply } from './letter-supply.mjs';
import { spawnPosition, fieldPosition, openingFeed, supplyProfile, DensityRamp, ArrivalClock, DeferredRefills } from './spawn.mjs';
import { exposedPosition } from './layout.mjs';
import { ProgressStore, STORAGE_KEY } from '../progress.mjs';
import { createAudio } from './audio.mjs';

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
let reducedMotion=motionPreference.matches;
const size=config.tiles.mobileSize;
let width=DESIGN.width,height=DESIGN.height,layout;
const tileShape={pitchOffset:0,yawOffset:0,halfDepth:DESIGN.tile.depth/2+DESIGN.tile.bevel+DESIGN.tile.letterDepth+2};
const storageKey='letterfall.best.points.v2';
let scene,tiles=[],hover=null,lastLabel=0,lastPhase='ready',feedbackUntil=0;
let best=0,roundBest=0,resumeAfterMenu=false,roundId='',activeOffset=0,bestChain=0,lastCheckpoint=0,lastLowWarning=-Infinity;
const menuStack=[];
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
  settings,book:progress.snapshot(),roundSummary:null,wordbookFilter:'all',wordbookSort:'recent',wordbookQuery:'',wordbookPage:0,wordbookOnlyNew:false,wordDetail:'',menuReturn:'',statsView:'lifetime'};
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
  reducedMotion=settings.reducedMotion;audio.setSettings(settings);scene?.setReducedMotion(reducedMotion);
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
    feedback(`${reason} / -${format(result.penalty)}s`,'bad');sound(result.reason==='clear'?'clear':'invalid');
  }else if(result.type==='effect'){
    if(result.effect==='smoke'){scene.releaseSmoke(result.origin);feedback('Smoke!','smoke');sound('grenade');}
    else{view.feedback='';view.feedbackKind='';feedbackUntil=0;sound(result.effect==='fire'?'fire':'hourglass');}
  }
  else if(result.type==='letter')sound('letter',{length:game.current.length});
  sync();
}
function visibleTiles(){return tiles.filter(tile=>exposedTile(tile)&&(tile.bornAt===undefined||game.elapsed-tile.bornAt>=config.falling.replacementFadeSeconds));}
function pick(tile){
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
  const letters=visibleTiles().map(tile=>tile.blank?'blank wildcard (0 points)':`${tile.letter}${tile.effect==='smoke'?' (magenta, smoke)':tile.effect==='hourglass'?' (ice, slow time)':tile.effect==='fire'?` (fire, ${config.fire.worldTimeScale} times faster tiles)`:''}${tile.bonus?' (gold, double score)':''}`).join(', ');
  const effects=`${game.effects.fire>0?` Faster tiles: ${Math.ceil(game.effects.fire)} seconds. Timers remain at normal speed.`:''}${game.effects.hourglass>0?` Slow time: ${Math.ceil(game.effects.hourglass)} seconds.`:''}${game.effects.smoke>0?` Smoke: ${Math.ceil(game.effects.smoke)} seconds.`:''}`;
  const description=scene.ui.description(game,view);
  const label=`${description}${effects} ${view.mode||game.phase==='ready'?'':`Visible tiles: ${letters}. `}Controls: ${labels.map(c=>c.label).join('; ')}. ${view.focus?`Focused control: ${labels.find(c=>c.id===view.focus)?.label||''}. `:''}Tab to focus a control, Enter or Space to activate. Letter keys catch matching tiles; ? or * catches a blank wildcard; Enter submits; Backspace clears the whole word; Escape pauses or resumes.`;
  if(scene.canvas.getAttribute('aria-label')!==label)scene.canvas.setAttribute('aria-label',label);
}
function begin(){
  if(roundId&&game.phase!=='over')finishRound(true);
  roundBest=best;game.start(performance.now());difficulty.reset();scene.reset();refills.reset();densityRamp.reset();arrivals.reset();hover=null;updateLayout();seed();
  roundId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeOffset=view.book.stats?.activeSeconds||0;bestChain=0;lastCheckpoint=0;lastLowWarning=-Infinity;
  progress.beginRound(roundId);refreshBook();
  Object.assign(view,{mode:'',focus:'',hover:'',collectionPage:0,feedback:'',feedbackKind:'',roundSummary:null});feedbackUntil=0;resumeAfterMenu=false;menuStack.length=0;
  sync();updateLabel();scene.canvas.focus({preventScroll:true});sound('start');
}
function togglePause(){
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
function queryInput(key){
  sound('ui');
  if(key==='done'){closeMenu();return;}
  if(key==='backspace')view.wordbookQuery=view.wordbookQuery.slice(0,-1);
  else if(/^[A-Z]$/i.test(key)&&view.wordbookQuery.length<32)view.wordbookQuery+=key.toUpperCase();
  view.wordbookPage=0;sync();updateLabel();
}
function act(action){
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
    case 'help':case 'settings':case 'stats':case 'goals':openMenu(action);return;
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
  if(view.mode==='search'&&(/^[a-z]$/i.test(event.key)||event.key==='Backspace'||event.key==='Enter')){event.preventDefault();queryInput(event.key==='Backspace'?'backspace':event.key==='Enter'?'done':event.key);return;}
  if(event.key==='Tab'){
    event.preventDefault();sound('ui');view.focus=scene.ui.focusNext(view.focus,event.shiftKey?-1:1);scene.canvas.focus({preventScroll:true});sync();updateLabel();return;
  }
  if(event.key==='Escape'){
    event.preventDefault();if(view.mode&&view.mode!=='paused'&&view.mode!=='over')closeMenu();else if(game.phase!=='over')togglePause();return;
  }
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    if(view.focus&&scene.ui.buttons().some(c=>c.id===view.focus))act(view.focus);
    else if(view.mode)act('menu');
    else if(game.phase==='ready')begin();
    else if(game.phase==='running'){if(event.key==='Enter')act('submit');else togglePause();}
    return;
  }
  if(view.mode||game.phase!=='running')return;
  if(event.key==='Backspace'){event.preventDefault();act('undo');}
  else if(event.key==='?'||event.key==='*'){event.preventDefault();const tile=visibleTiles().find(t=>t.blank);if(tile)pick(tile);else{feedback('No blank in reach yet.');sound('miss');}}
  else if(/^[a-z]$/i.test(event.key)){
    event.preventDefault();const tile=visibleTiles().filter(t=>t.letter===event.key.toUpperCase()).sort((a,b)=>b.y-a.y)[0];
    if(tile)pick(tile);else{feedback(`No ${event.key.toUpperCase()} in reach yet.`);sound('miss');}
  }
});
try{
  scene=await createScene(document.getElementById('scene'),config,reducedMotion);
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
    hover=game.phase==='running'&&!view.mode?hit?.tile||null:null;
    scene.canvas.style.cursor=view.hover||hover?'pointer':'default';
  });
  scene.canvas.addEventListener('pointerleave',()=>{hover=null;view.hover='';});
  scene.canvas.addEventListener('blur',()=>{view.focus='';});
  scene.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(game.phase==='running')togglePause();scene.canvas.setAttribute('aria-label','The 3D scene needs a refresh. Your best score and saved Wordbook are safe.');});
  scene.canvas.addEventListener('webglcontextrestored',()=>location.reload());
  tiles=[];
  sync();updateLabel();let previous=performance.now();
  function frame(now){
    const dt=Math.min((now-previous)/1000,.05);previous=now;updateLayout();handle(game.advance(now));
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
  document.getElementById('scene').setAttribute('aria-label','CLTTR could not load. Refresh in a browser with WebGL enabled.');
  document.title='CLTTR — unable to load the 3D scene';
}
