import { DESIGN } from './design.js';
import { createScene } from './scene.js';
import { prepareTile, settleTiles, stepTiles } from './physics.mjs';
import { PrefixLetterSupply, FrequencyLetterSupply } from './letter-supply.mjs';
import { spawnPosition, fieldPosition, DeferredRefills } from './spawn.mjs';
import { exposedPosition, letterTarget } from './layout.mjs';

// Only the WebGL canvas is attached to the page. The interface and its hit
// targets live in ui.js; the original dictionary and game rules stay shared.
if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
const game=new Letterfall.WordGame(LETTERFALL_WORDS);
const config=game.config,motion=LetterfallMotion;
const refills=new DeferredRefills(config.falling);
const letterSupply=new PrefixLetterSupply(game.dictionary,config.wordAssist);
const frequencySupply=new FrequencyLetterSupply(config.letterFrequency);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const size=config.tiles.mobileSize;
let width=DESIGN.width,height=DESIGN.height,layout;
const tileShape={pitchOffset:DESIGN.tile.tiltX,yawOffset:DESIGN.tile.tiltY,halfDepth:DESIGN.tile.depth/2+DESIGN.tile.bevel+DESIGN.tile.letterDepth+2};
const storageKey='letterfall.best.points.v2';
let scene,tiles=[],spawnClock=0,hover=null,lastLabel=0,lastPhase='ready',feedbackUntil=0;
let soundOn=false,audioContext,best=0,roundBest=0,resumeAfterMenu=false;
const view={mode:'',collectionPage:0,feedback:'',feedbackKind:'',focus:'',hover:'',best:0,roundBest:0,soundOn:false};
try{const saved=Number(localStorage.getItem(storageKey));if(Number.isSafeInteger(saved)&&saved>=0)best=saved;}catch{/* Storage is optional. */}
const format=value=>String(Number(value.toFixed(2)));
function feedback(message,kind=''){
  view.feedback=message;view.feedbackKind=kind;feedbackUntil=performance.now()+config.feedback.durationSeconds*1000;
}
function tone(kind) {
  if (!soundOn) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    void audioContext.resume().catch(() => {});
    const notes = kind === 'word' ? [523,659,784] : kind === 'penalty' ? [196,147] : [370+game.current.length*35];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), at = audioContext.currentTime + i*.075;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(.055,at+.01); gain.gain.exponentialRampToValueAtTime(.001,at+.16);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(at); oscillator.stop(at+.18);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* Audio does not affect gameplay. */ }
}
function makeTile(letter, x, y,fade=false) {
  const blank=letter==='?',traits=blank?{bonus:false,grenade:false}:game.rollTileTraits();
  return prepareTile({ ...tileShape, kind:'letter', letter,blank,x,y,...traits,...(fade?{bornAt:game.elapsed}:{}),
    tilt:motion.radians((Math.random()*2-1)*config.rotation.maxInitialAngleDegrees), rotationSpeed:motion.rotationSpeed(config.rotation) },config);
}
function seed() {
  const count=Math.max(config.opening.mobileTiles,letterTarget(layout,config));
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
function refillChoices(afterPick=false){
  if(game.phase!=='running')return;
  const visible=tiles.filter(tile=>tile.kind==='letter'&&exposedTile(tile)).length;
  const budget=refills.budget(visible,letterTarget(layout,config),afterPick);
  const blocked=refills.blocked(game.elapsed);
  for(let i=0;i<budget;i++){
    const position=fieldPosition(tiles,layout,size,Math.random,blocked,refills.gaps);if(!position)break;
    tiles.push(makeTile(nextLetter(),position.x,position.y,true));
    refills.placed();
  }
  settleTiles(tiles,width,size,config.physics);
}
function spawn() {
  refillChoices();
  const limit=Math.max(config.falling.letterLimit,letterTarget(layout,config)+Math.min(16,Math.ceil(width/size)*2));
  const position=spawnPosition(tiles,width,size,{...config,falling:{...config.falling,letterLimit:limit}});
  if(position)tiles.push(makeTile(nextLetter(),position.x,position.y));
}
function offerHourglass() {
  tiles=tiles.filter(tile=>tile.kind!=='hourglass');
  tiles.push(prepareTile({...tileShape,...LetterfallEffects.hourglassPosition(width,size,tiles),kind:'hourglass',tilt:0},config));
}
function handle(result){
  if(!result||result.type==='ignored')return;
  if(result.type==='word'){
    if(result.hourglassOffered)offerHourglass();
    if(game.score>best){best=game.score;try{localStorage.setItem(storageKey,String(best));}catch{}}
    view.feedback='';view.feedbackKind='';feedbackUntil=0;
    scene.ui.celebrate(result,game);tone('word');
  }else if(result.type==='penalty'){
    const reason={repeat:'Already collected',clear:'Word cleared',spelling:'No word starts that way',incomplete:'Not a complete word'}[result.reason];
    feedback(`${reason} / -${format(result.penalty)}s`,'bad');tone('penalty');
  }else if(result.type==='effect'){feedback(`Slow time / ${format(result.duration)} seconds`,'slow');tone('word');}
  else if(result.type==='letter')tone('letter');
  if(result.smokeTriggered){scene.releaseSmoke();feedback(`Smoke screen / ${format(config.smoke.durationSeconds)} seconds`);}
  sync();
}
function visibleTiles(){return tiles.filter(tile=>exposedTile(tile)&&(tile.bornAt===undefined||game.elapsed-tile.bornAt>=config.falling.replacementFadeSeconds));}
function pick(tile){
  if(game.phase!=='running'||view.mode)return;
  if(tile.bornAt!==undefined&&game.elapsed-tile.bornAt<config.falling.replacementFadeSeconds)return;
  view.focus='';
  const result=tile.kind==='hourglass'?game.collectHourglass(performance.now()):game.select(tile.letter,performance.now(),tile);
  if(['letter','penalty','effect'].includes(result.type)){
    tiles=tiles.filter(item=>item!==tile);scene.burst(tile);hover=null;
    if(tile.kind==='letter'&&game.phase==='running')refills.picked(tile,game.elapsed);
  }
  handle(result);refillChoices(true);updateLabel();
}
function sync(){
  view.best=best;view.roundBest=roundBest;view.soundOn=soundOn;
  if(game.phase!==lastPhase){
    lastPhase=game.phase;
    if(game.phase==='over'){
      tiles=tiles.filter(tile=>tile.kind!=='hourglass');scene?.reset();view.mode='over';view.focus='menu';
    }
  }
  scene?.ui.sync(game,view);
}
function updateLabel(){
  if(!scene)return;
  const labels=scene.ui.buttons();
  const letters=visibleTiles().map(tile=>tile.kind==='hourglass'?'hourglass pickup':tile.blank?'blank wildcard (0 points)':`${tile.letter}${tile.bonus?' (gold)':''}${tile.grenade?' (grenade)':''}`).join(', ');
  const effects=`${game.effects.hourglass>0?` Slow time: ${Math.ceil(game.effects.hourglass)} seconds.`:''}${game.effects.smoke>0?` Smoke: ${Math.ceil(game.effects.smoke)} seconds.`:''}`;
  const description=scene.ui.description(game,view);
  const label=`${description}${effects} ${view.mode?'':`Visible tiles: ${letters}. `}Controls: ${labels.map(c=>c.label).join('; ')}. ${view.focus?`Focused control: ${labels.find(c=>c.id===view.focus)?.label||''}. `:''}Tab to focus a control, Enter or Space to activate. Letter keys catch matching tiles; ? or * catches a blank wildcard; Enter submits; Backspace clears the whole word; 1 collects a visible hourglass; Escape pauses or resumes.`;
  if(scene.canvas.getAttribute('aria-label')!==label)scene.canvas.setAttribute('aria-label',label);
}
function begin(){
  roundBest=best;game.start(performance.now());scene.reset();refills.reset();spawnClock=0;hover=null;updateLayout();seed();
  Object.assign(view,{mode:'',focus:'',hover:'',collectionPage:0,feedback:'',feedbackKind:''});feedbackUntil=0;resumeAfterMenu=false;
  sync();updateLabel();scene.canvas.focus({preventScroll:true});
}
function togglePause(){
  if(game.phase==='running'){
    handle(game.pause(performance.now()));
    if(game.phase==='paused'){view.mode='paused';view.focus='menu';}
  }else if(game.phase==='paused'){
    game.resume(performance.now());view.mode='';view.focus='';resumeAfterMenu=false;
  }
  sync();updateLabel();
}
function openMenu(mode){
  resumeAfterMenu=game.phase==='running';
  if(resumeAfterMenu)handle(game.pause(performance.now()));
  if(game.phase==='over')return;
  view.mode=mode;view.focus='menu';view.collectionPage=0;sync();updateLabel();
}
function closeMenu(){
  view.mode='';view.focus='';if(resumeAfterMenu)game.resume(performance.now());resumeAfterMenu=false;sync();updateLabel();
}
function act(action){
  scene.ui.press(action,performance.now());
  view.hover='';view.focus='';hover=null;
  switch(action){
    case 'start':case 'restart':begin();return;
    case 'pause':togglePause();return;
    case 'submit':handle(game.submit(performance.now()));break;
    case 'undo':handle(game.undo(performance.now()));break;
    case 'sound':soundOn=!soundOn;tone('letter');break;
    case 'help':openMenu('help');return;
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
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.phase==='running')togglePause();});
window.addEventListener('keydown',event=>{
  if(!scene||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='Tab'){
    event.preventDefault();view.focus=scene.ui.focusNext(view.focus,event.shiftKey?-1:1);scene.canvas.focus({preventScroll:true});sync();updateLabel();return;
  }
  if(event.key==='Escape'){
    event.preventDefault();if(['help','collection'].includes(view.mode))closeMenu();else if(game.phase!=='over')togglePause();return;
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
  else if(event.key==='?'||event.key==='*'){event.preventDefault();const tile=visibleTiles().find(t=>t.blank);if(tile)pick(tile);}
  else if(event.key==='1'){event.preventDefault();const tile=visibleTiles().find(t=>t.kind==='hourglass');if(tile)pick(tile);}
  else if(/^[a-z]$/i.test(event.key)){
    event.preventDefault();const tile=visibleTiles().filter(t=>t.letter===event.key.toUpperCase()).sort((a,b)=>b.y-a.y)[0];
    if(tile)pick(tile);else feedback(`No ${event.key.toUpperCase()} in reach yet.`);
  }
});
try{
  scene=await createScene(document.getElementById('scene'),config,reducedMotion);
  updateLayout();
  scene.canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();scene.canvas.focus({preventScroll:true});view.focus='';
    const hit=scene.hit(event.clientX,event.clientY);
    if(hit?.action)act(hit.action);else if(hit?.tile)pick(hit.tile);
  });
  scene.canvas.addEventListener('pointermove',event=>{
    const hit=scene.hit(event.clientX,event.clientY);view.hover=hit?.action||'';
    hover=game.phase==='running'&&!view.mode?hit?.tile||null:null;
    scene.canvas.style.cursor=view.hover||hover?'pointer':'default';
  });
  scene.canvas.addEventListener('pointerleave',()=>{hover=null;view.hover='';});
  scene.canvas.addEventListener('blur',()=>{view.focus='';});
  scene.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(game.phase==='running')togglePause();scene.canvas.setAttribute('aria-label','The 3D scene needs a refresh. Your best score is saved.');});
  scene.canvas.addEventListener('webglcontextrestored',()=>location.reload());
  const positions=[[70,38,-.14],[207,30,.16],[290,95,-.22],[147,121,.17],[54,156,-.18],[261,166,.14]];
  tiles=[...'CLTTR'].map((letter,i)=>({...makeTile(letter,layout.left+positions[i][0],layout.top+140+positions[i][1]),tilt:positions[i][2],bonus:i===2,grenade:false}));
  sync();updateLabel();let previous=performance.now();
  function frame(now){
    const dt=Math.min((now-previous)/1000,.05);previous=now;updateLayout();handle(game.advance(now));
    if(game.phase==='running'){
      const worldDt=dt*game.timeScale;
      stepTiles(tiles,worldDt,{width,size,speed:config.falling.pixelsPerSecond,config,reducedMotion});
      if(tiles.some(tile=>tile.kind==='hourglass'&&tile.y>=height+size))game.discardHourglass();
      tiles=tiles.filter(tile=>tile.y<height+size&&(tile.kind!=='hourglass'||game.hourglassOffer));
      spawnClock+=worldDt;if(spawnClock>=config.falling.mobileSpawnSeconds){spawnClock=0;spawn();}
    }
    if(now>feedbackUntil){view.feedback='';view.feedbackKind='';}
    sync();scene.render(tiles,game,dt,now,hover,view);
    if(now-lastLabel>250){updateLabel();lastLabel=now;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}catch(error){
  console.error(error);
  document.getElementById('scene').setAttribute('aria-label','CLTTR could not load. Refresh in a browser with WebGL enabled.');
  document.title='CLTTR — unable to load the 3D scene';
}
