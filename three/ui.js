import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { celMaterial } from './materials.js';
import { DESIGN } from './design.js';
import { createIcon } from './icons.js';
import { RewardMeters, ScoreFlights, scoreFlightPose, clamp01, easeOut } from './reward-motion.mjs';
import { overlapsPanel } from './layout.mjs';

// Every visible interface element is geometry in this scene. There are no
// DOM buttons, CSS labels, HTML textures, sprites, or CSS2D/CSS3D renderers.
export function createUI(font, config, reducedMotion=false) {
  const scene = new THREE.Scene();
  const palette = DESIGN.palette;
  const materials = {
    letterInk: celMaterial(palette.letterInk), purpleLetter: celMaterial(palette.purpleLetter), blueLetter: celMaterial(palette.blueLetter),
    ink: celMaterial(palette.plum), cream: celMaterial(palette.cream),
    gold: celMaterial(palette.gold), mint: celMaterial(palette.mint),
    paper: celMaterial(['#ffefd3', '#e0b69e']),
    muted: celMaterial(['#ac7e78', '#926770']),
    pale: celMaterial(['#e9c5a8', '#d7a78e']),
    primary: celMaterial(['#efbf65', '#d99a3d']),
    primaryHover: celMaterial(['#f8cf7a', '#e8ad4c']),
    lightText: celMaterial(['#ffefd3', '#e4c49e']),
    edge: celMaterial(['#c19b8b', '#957184']),
    primaryEdge: celMaterial(['#b67c35', '#8b592b']),
    danger: celMaterial(['#bb545c', '#8d4355']),
    buttonShine: celMaterial(['#fff4db', '#f7dfba']),
    primaryShine: celMaterial(['#ffe2a1', '#f6ca73']),
    iconShade: celMaterial(['#352637', '#2e2033']),
    goldInk: celMaterial(palette.goldInk || ['#604021','#493017']),
    goldLight: celMaterial(palette.goldHighlight || ['#fff0b0','#ffe08a']),
    ice: celMaterial(palette.ice || ['#d5f0fb','#79b7dd']),
    iceInk: celMaterial(palette.iceInk || ['#214d73','#173654']),
    fire: celMaterial(palette.fire || ['#ffe329','#f5861f']),
    fireInk: celMaterial(palette.fireInk || ['#4b211c','#361b17']),
    smoke: celMaterial(palette.smokeTile || ['#d85e9f','#a83d7c']),
    smokeInk: celMaterial(palette.smokeInk || ['#fff0df','#ffe4cc']),
  };
  const geometryCache = new Map(), glyphCache = new Map(), slots = new Map();
  const controls = [];
  const point = (x, y, z = 0) => new THREE.Vector3(x - 180, 320 - y, z);
  const fmt = n => String(Number(n.toFixed(2)));
  const {nextLetterSeconds,extensionAfterLength,extensionSecondsPerLetter}=config.rules;
  const sixLetterTarget=Math.min(config.rewards.sixLetterTargetSeconds,config.timer.maxSeconds);
  const overtimePercent=Math.round(config.timer.overtimeMultiplier*100);
  const timeRewardCopy=`Six-letter words refill to ${fmt(sixLetterTarget)} seconds, or add ${fmt(config.rewards.sixLetterBonusSeconds)} seconds when above ${fmt(sixLetterTarget)}. Seven-letter words refill the normal bar without reducing overtime. Eight or more letters refill to ${overtimePercent}% overtime. All rewards stop at ${fmt(config.timer.maxSeconds*config.timer.overtimeMultiplier)} seconds.`;
  const letterTimingCopy=extensionSecondsPerLetter>0?`First ${extensionAfterLength} letters: ${fmt(nextLetterSeconds)}s each. Letter ${extensionAfterLength+1}: ${fmt(nextLetterSeconds+extensionSecondsPerLetter)}s; letter ${extensionAfterLength+2}: ${fmt(nextLetterSeconds+extensionSecondsPerLetter*2)}s. Then +${fmt(extensionSecondsPerLetter)}s per letter.`:`Each letter gives ${fmt(nextLetterSeconds)} seconds.`;
  // Guard presentation-only timings without changing any game clock.
  const presentationSeconds=(value,fallback)=>Number.isFinite(value)&&value>0?Math.max(.05,Math.min(2,value)):fallback;
  const successSeconds=presentationSeconds(config.engagement?.successSeconds,.28);
  const discoverySeconds=presentationSeconds(config.engagement?.discoverySeconds,.6);
  let phase = 'ready', mode = '', focus = '', hover = '', lastPress = '', pressUntil = 0;
  let collectionPage = 0, collectionPages = 1, bookPages = 1;
  const meters=new RewardMeters(config.celebration),celebrations=[];
  const scoreLedger=new ScoreFlights({durationSeconds:config.engagement?.scoreFlightSeconds}),scoreFlights=[];
  let scoreSettleAge=Infinity,goldCelebration=null;
  let currentLayout=null,effectsVisible=false;

  function group(parent = scene, x = 0, y = 0, z = 0) {
    const object = new THREE.Group();
    object.position.copy(parent === scene ? point(x, y, z) : new THREE.Vector3(x, -y, z));
    parent.add(object); return object;
  }
  // Root groups use screen coordinates; children use local offsets.
  const hud = group(scene), homeHud = group(scene), intro = group(scene), playing = group(scene), modal = group(scene),status=group(scene);
  // group(scene) puts its origin at the top left of the 360 x 640 camera.
  function rectGeometry(w, h, radius = 8, depth = 2) {
    const key = `${w}:${h}:${radius}:${depth}`;
    if (!geometryCache.has(key)) {
      const r = Math.min(radius, w / 2, h / 2), s = new THREE.Shape();
      s.moveTo(r, 0); s.lineTo(w-r,0); s.quadraticCurveTo(w,0,w,-r);
      s.lineTo(w,-h+r); s.quadraticCurveTo(w,-h,w-r,-h);
      s.lineTo(r,-h); s.quadraticCurveTo(0,-h,0,-h+r);
      s.lineTo(0,-r); s.quadraticCurveTo(0,0,r,0);
      const geo = new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:Math.min(.8,h*.07),bevelThickness:.65,bevelSegments:1,curveSegments:10,steps:1});
      geometryCache.set(key, geo);
    }
    return geometryCache.get(key);
  }
  function panel(parent,x,y,w,h,material='paper',radius=8,z=0,depth=2) {
    const mesh = new THREE.Mesh(rectGeometry(w,h,radius,depth),materials[material]);
    mesh.position.set(x,-y,z);parent.add(mesh);return mesh;
  }
  function glyph(char, size, raised = false) {
    const key = `${char}:${size}:${raised}`;
    if (!glyphCache.has(key)) {
      const geometry = new TextGeometry(char, {font,size,depth:raised?.7:.12,curveSegments:3,bevelEnabled:raised,bevelThickness:.12,bevelSize:.1,bevelSegments:1});
      glyphCache.set(key, geometry);
    }
    return glyphCache.get(key);
  }
  function measure(text,size,spacing=0) {
    return [...String(text)].reduce((sum,char)=>sum+(font.data.glyphs[char]?.ha??font.data.glyphs['?'].ha)/font.data.resolution*size+spacing,0)-spacing;
  }
  function text(parent,value,x,y,{size=8,align='left',material='ink',maxWidth=Infinity,spacing=0,raised=false,z=6,colors}={}) {
    const content=String(value), originalWidth=Math.max(0,measure(content,size,spacing));
    const scale=Math.min(1,maxWidth/Math.max(1,originalWidth));
    const g=new THREE.Group();g.userData.uiText=content;g.position.set(x-(align==='center'?originalWidth*scale/2:align==='right'?originalWidth*scale:0),-y-size*scale,z);g.scale.setScalar(scale);parent.add(g);
    let cursor=0;
    [...content].forEach((char,i)=>{
      if(char!==' '){const mesh=new THREE.Mesh(glyph(char,size,raised),materials[colors?.[i]||material]);mesh.position.x=cursor;g.add(mesh);}
      cursor+=(font.data.glyphs[char]?.ha??font.data.glyphs['?'].ha)/font.data.resolution*size+spacing;
    });
    return g;
  }
  function lines(parent,value,x,y,{width=270,size=8,lineHeight=13,align='left',material='muted',z=6}={}) {
    let row=0;
    for(const paragraph of String(value).split('\n')){
      let line='';
      for(const word of paragraph.split(' ')){
        const candidate=line?`${line} ${word}`:word;
        if(line && measure(candidate,size)>width){text(parent,line,x,y+row*lineHeight,{size,align,material,z});row++;line=word;}else line=candidate;
      }
      text(parent,line,x,y+row*lineHeight,{size,align,material,z});row++;
    }
    return row*lineHeight;
  }
  function slot(key,parent,signature,build) {
    const old=slots.get(key);if(old?.signature===signature)return old.group;
    if(old){
      for(let i=controls.length-1;i>=0;i--)if(isWithin(controls[i].root,old.group)){if(controls[i].quiet)controls[i].body.material.dispose();controls.splice(i,1);}
      old.group.removeFromParent();
    }
    const g=new THREE.Group();parent.add(g);build(g);slots.set(key,{signature,group:g});return g;
  }
  function icon(parent,kind,x,y,{scale=1,material='ink',accent,z=6}={}) {
    const g=createIcon(kind,materials[material],accent?materials[accent]:materials[material]);
    g.position.set(x,-y,z);g.scale.setScalar(scale);parent.add(g);return g;
  }
  const shadowMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{size:{value:new THREE.Vector2(1,1)},radius:{value:10}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform vec2 size;uniform float radius;
      void main(){vec2 p=abs((vUv-.5)*(size+32.))-size*.5+radius;
        float d=length(max(p,0.))+min(max(p.x,p.y),0.)-radius;
        gl_FragColor=vec4(.16,.08,.20,.22*exp(-pow(max(d,0.)/8.,2.)));}`,
  });
  const shadowMaterials=new Map();
  function dropShadow(parent,x,y,w,h,r=10,z=-6){
    const key=`shadow:${w}:${h}`;
    if(!geometryCache.has(key))geometryCache.set(key,new THREE.PlaneGeometry(w+32,h+32));
    const materialKey=`${w}:${h}:${r}`;
    if(!shadowMaterials.has(materialKey)){const material=shadowMaterial.clone();material.uniforms.size.value.set(w,h);material.uniforms.radius.value=r;shadowMaterials.set(materialKey,material);}
    const mat=shadowMaterials.get(materialKey);
    const mesh=new THREE.Mesh(geometryCache.get(key),mat);mesh.position.set(x+w/2+2,-y-h/2-5,z);parent.add(mesh);return mesh;
  }
  function plinth(parent,x,y,w,h,r=14){
    dropShadow(parent,x,y,w,h,r);
    panel(parent,x+1,y+4,w,h,'edge',r,-5,3);
    return panel(parent,x,y,w,h,'paper',r,-3,3);
  }
  function button(parent,id,label,x,y,w,h,{primary=false,quiet=false,iconName,small=false,round=false,gold=false,centered=false}={}) {
    const root=group(parent,x,y,1),radius=round?Math.min(w,h)/2:primary?18:12;
    // A fixed foot and shadow make the moving cap read as a real little key.
    if(!quiet){dropShadow(root,0,2,w,h,radius,-5);panel(root,0,4,w,h,primary||gold?'primaryEdge':'edge',radius,-3,3);}
    const face=group(root);
    const body=panel(face,0,0,w,h,primary?'primary':gold?'gold':quiet?'cream':'paper',radius,0,primary?4:2);
    if(quiet)body.material=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});

    const c={id,label,root,face,body,enabled:true,primary,quiet,gold,w,h,layoutY:y};controls.push(c);
    body.userData.control=c;
    const labelSize=centered?24:small?7.5:primary?(h>=50?16:12):9;
    if(label)text(face,label,centered?w/2:primary?19:w/2,(h-labelSize)/2-1,{size:labelSize,align:centered?'center':primary?'left':'center',material:primary||gold?'goldInk':'ink',maxWidth:w-(centered?28:primary?59:12),raised:centered,z:5});
    if(primary&&!centered)icon(face,/^Back/.test(label)?'back':'play',w-25,h/2,{material:'goldInk',scale:.8,z:5});
    if(iconName)icon(face,iconName,w/2,h/2,{z:5});
    const marker=panel(root,w/2-6,h+4,12,2,'gold',1,2,.5);marker.visible=false;c.marker=marker;
    return c;
  }
  function isWithin(object,parent){for(let o=object;o;o=o.parent)if(o===parent)return true;return false;}
  function ancestorsVisible(object){for(let o=object;o;o=o.parent){if(!o.visible)return false;if(o===scene)return true;}return false;}
  function enabledControls(){
    return controls.filter(c=>c.enabled&&ancestorsVisible(c.root)&&(mode?isWithin(c.root,modal):!isWithin(c.root,modal)));
  }
  function setEnabled(c,enabled){c.enabled=enabled;c.body.material=materials[enabled?(c.primary?'primary':c.gold?'gold':'paper'):'pale'];}

  // A few tactile objects float over the playfield, leaving room for letters.
  const scoreShell=group(hud,18,10);
  dropShadow(scoreShell,0,0,132,32,16);
  panel(scoreShell,0,3,132,32,'edge',16,-2,2);
  panel(scoreShell,0,0,132,32,'paper',16,0,3);
  icon(scoreShell,'coin',19,16,{material:'gold',accent:'goldInk',scale:.85,z:5});
  const scoreAnchor=group(hud,137,13);
  const pause=button(hud,'pause','',298,6,44,44,{iconName:'pause',round:true});
  pause.label='Pause game';
  // A dedicated, recessed rail clears the score and pause controls. Its fill
  // remains the normal clock color during fire: only the letters speed up.
  const timerTrack=panel(hud,18,60,324,10,'edge',5,2,1);
  timerTrack.userData.roundTimeTrack=true;
  const timer=panel(hud,20,61,320,8,'ink',4,4,.6);
  timer.userData.roundTimeBar=true;
  const overtime=panel(hud,20,61,320,8,'gold',4,5.4,.6);
  overtime.userData.overtimeBar=true;overtime.visible=false;
  const recharge=panel(hud,20,61,320,8,'mint',4,6.5,.4);
  recharge.material=materials.mint.clone();recharge.material.transparent=true;recharge.material.depthWrite=false;recharge.visible=false;

  const settingsButton=button(homeHud,'settings','',298,8,44,44,{iconName:'gear',round:true});
  settingsButton.label='Settings';
  const brandTiles=[];
  [...'CLTTR'].forEach((letter,i)=>{
    const tile=group(intro,57+i*61,191,4),angle=[-.09,.055,-.04,.075,-.055][i];
    tile.rotation.z=angle;tile.userData.brandTile=true;
    dropShadow(tile,-26,-31,52,62,12);
    panel(tile,-26,-27,52,62,i===2?'primaryEdge':'edge',12,-3,4);
    panel(tile,-26,-31,52,62,i===2?'primary':'paper',12,0,5);
    text(tile,letter,0,-18,{size:35,align:'center',material:i===2?'goldInk':'ink',raised:true,z:7});
    brandTiles.push({tile,angle,index:i});
  });
  text(intro,'Catch letters.',180,257,{size:13,align:'center'});
  text(intro,'Discover your next word.',180,279,{size:9.5,align:'center',material:'muted'});
  const start=button(intro,'start',"Let's Play",70,334,220,76,{primary:true,centered:true});
  const homeBook=button(intro,'wordbook','',42,425,132,62);
  icon(homeBook.face,'book',66,19,{scale:.7,material:'ink',accent:'iconShade'});
  text(homeBook.face,'Word Book',66,39,{size:9,align:'center'});homeBook.label='Word Book';
  const homeProgress=button(intro,'stats','',186,425,132,62);
  icon(homeProgress.face,'progress',66,19,{scale:.75,material:'ink'});
  text(homeProgress.face,'Your Progress',66,39,{size:8.5,align:'center'});
  homeProgress.label='Your Progress';
  const help=button(intro,'help','How to Play',79,508,202,42);
  help.label='How to Play';

  plinth(playing,12,544,336,76,16);
  const submit=button(playing,'submit','',76,554,262,54);
  icon(submit.face,'paperPlane',237,27,{material:'ink',accent:'iconShade',scale:1.15,z:5});
  const undo=button(playing,'undo','',22,559,46,44);
  icon(undo.face,'trash',23,22,{material:'ink',accent:'iconShade',scale:.84,z:5});
  const letterTimer=panel(submit.face,13,46,230,3,'ink',1.5,7,.25);
  letterTimer.visible=false;

  // Time remains beside the clock. Point badges travel from the submitted word
  // to the score without adding hit targets or stopping the next selection.
  const rewardLayer=group(scene);
  function fadeMaterials(root){
    const clones=new Map();
    root.traverse(object=>{
      if(!object.isMesh)return;
      const source=object.material;
      if(!clones.has(source)){
        const material=source.clone();material.transparent=true;material.depthWrite=false;
        clones.set(source,material);
      }
      object.material=clones.get(source);
    });
    return [...clones.values()];
  }
  function setAlpha(list,alpha){for(const material of list){if(material.uniforms?.opacity)material.uniforms.opacity.value=alpha;else material.opacity=alpha;}}
  function removeCelebration(item){item.root.removeFromParent();for(const material of item.materials)material.dispose();}
  function clearScoreFlights(){
    for(const item of scoreFlights)removeCelebration(item);
    scoreFlights.length=0;scoreLedger.reset();scoreSettleAge=Infinity;scoreAnchor.scale.setScalar(1);
  }
  function clearGoldCelebration(){
    if(goldCelebration)removeCelebration(goldCelebration);
    goldCelebration=null;
  }
  function celebrateGold(){
    clearGoldCelebration();
    const root=group(rewardLayer,180,139,20),badge=group(root);
    root.userData.goldCelebration=true;
    panel(badge,-106,-21,212,42,'goldInk',14,-2,2);
    panel(badge,-104,-23,208,40,'gold',13,1,3);
    panel(badge,-92,-21,184,2,'goldLight',1,5,.3);
    text(badge,'Double Score!',0,-10,{size:18,align:'center',material:'goldInk',raised:true,z:6,maxWidth:183});
    const sparkles=[];
    for(const [x,y] of [[-120,-20],[119,-16],[-113,25],[112,23]]){
      const star=group(badge,x,y,5);
      panel(star,-1,-5,2,10,'goldLight',1,0,.4);panel(star,-5,-1,10,2,'goldLight',1,0,.4);
      sparkles.push(star);
    }
    goldCelebration={root,badge,sparkles,materials:fadeMaterials(root),age:0};
    animateGoldCelebration();
  }
  function animateGoldCelebration(){
    if(!goldCelebration)return;
    const item=goldCelebration,t=clamp01(item.age/.3),v=t-1;
    const pop=1+2.7*v*v*v+1.7*v*v;
    item.badge.scale.setScalar(reducedMotion?1:.65+.35*pop);
    item.badge.rotation.z=reducedMotion?0:Math.sin(item.age*13)*.045*Math.exp(-item.age*3);
    item.root.position.y=-(139-(reducedMotion?0:5*easeOut(clamp01(item.age/1.6))));
    item.sparkles.forEach((star,i)=>star.scale.setScalar(reducedMotion?1:.8+.22*Math.sin(item.age*10+i)));
    setAlpha(item.materials,(reducedMotion?1:clamp01(item.age/.08))*(1-clamp01((item.age-1.2)/.4)));
  }
  function flightOrigin(word){
    const width=Math.min(184,measure(word||'',24));
    return {x:Math.min(273,89+width/2),y:(currentLayout?.height||640)-(currentLayout?.bottom||0)-(currentLayout?.top||0)-59};
  }
  function addScoreFlight(result){
    const flight=scoreLedger.add(result.points,{immediate:reducedMotion});if(!flight)return;
    const root=group(rewardLayer,0,0,14),badge=group(root);
    const label=`+${result.points}`,width=Math.max(32,measure(label,12)+17);
    panel(badge,-width/2,-12,width,24,'cream',12,0,1.5);
    text(badge,label,0,-6,{size:12,align:'center',material:'ink',raised:true,z:4});
    const item={root,badge,materials:fadeMaterials(root),flight,word:result.word,from:flightOrigin(result.word),to:{x:112,y:26},lane:(flight.id%3)-1,reduced:reducedMotion};
    // These are diagnostic scene labels, never interactive control targets.
    root.userData.scoreFlight=flight;scoreFlights.push(item);animateScoreFlight(item);
  }
  function animateScoreFlight(item){
    item.from=flightOrigin(item.word);
    const pose=scoreFlightPose(item.flight,item.from,item.to,{reducedMotion:item.reduced,lane:item.lane});
    item.badge.position.set(pose.x,-pose.y,0);item.badge.scale.setScalar(pose.scale);setAlpha(item.materials,pose.alpha);
  }
  function celebrate(result,game){
    if(result?.type!=='word'||!(result.points>0))return;
    if(result.scoreMultiplier>1)celebrateGold();
    meters.add(result.reward,0);addScoreFlight(result);
    // Time labels stay coalesced; point flights retain independent arrivals.
    for(const item of celebrations)removeCelebration(item);celebrations.length=0;
    const root=group(rewardLayer),time=group(root,224,39,12);time.userData.timeReward=true;
    text(time,result.reward>0?`+${fmt(result.reward)}s`:'MAX',0,0,{size:8,align:'center',material:'muted',maxWidth:104});
    const reveal=group(root,180,522,10);reveal.userData.resolvedWord=result.word;
    const blanks=new Set(result.blankIndices||result.wildcardIndices||[...(result.pattern||result.submittedPattern||'')].flatMap((letter,index)=>letter==='?'?[index]:[]));
    text(reveal,result.word||'',0,0,{size:12,align:'center',maxWidth:288,colors:[...(result.word||'')].map((_,i)=>blanks.has(i)?'goldInk':'ink'),raised:true});
    const timeMaterials=fadeMaterials(time),revealMaterials=fadeMaterials(reveal);
    const item={root,time,reveal,materials:[...timeMaterials,...revealMaterials],timeMaterials,revealMaterials,age:0,result,startTime:meters.values(game.remaining,game.score).time};
    celebrations.push(item);animateCelebration(item);
  }
  function animateCelebration(item){
    const {age,time}=item,duration=config.celebration.durationSeconds,t=clamp01(age/duration);
    const alpha=clamp01(t/.12)*(1-clamp01((t-.55)/.45));
    const rise=reducedMotion?0:2*easeOut(t);
    time.position.y=-(39-rise);setAlpha(item.timeMaterials,alpha);
    item.reveal.visible=age<discoverySeconds;
    item.reveal.position.y=-((currentLayout?.height||640)-(currentLayout?.bottom||0)-(currentLayout?.top||0)-118)+(reducedMotion?0:2*(1-easeOut(clamp01(age/successSeconds))));
    setAlpha(item.revealMaterials,1-clamp01((age-discoverySeconds*.65)/(discoverySeconds*.35)));
  }
  function syncMeters(game){
    const shown={time:reducedMotion?game.remaining:meters.values(game.remaining,game.score).time,score:scoreLedger.value(game.score)},normalCapacity=config.timer.maxSeconds,timeRatio=shown.time/normalCapacity;
    const extraCapacity=game.maxTimeSeconds-normalCapacity,inOvertime=shown.time>normalCapacity;
    timer.scale.x=Math.max(.001,Math.min(1,timeRatio));
    timer.material=materials[game.effects.hourglass>0?'ice':game.remaining<=config.timer.lowTimeSeconds?'danger':'ink'];
    overtime.visible=inOvertime&&extraCapacity>0;
    overtime.scale.x=Math.max(.001,Math.min(1,(shown.time-normalCapacity)/Math.max(.001,extraCapacity)));
    const shownOvertime=overtime.visible?Math.ceil(timeRatio*100):0;
    slot('overtime',hud,shownOvertime,g=>{
      if(shownOvertime){g.userData.overtimeLabel=true;text(g,`OVERTIME ${shownOvertime}%`,224,20,{size:7.8,align:'center',material:'goldInk',maxWidth:130});}
    });
    scoreAnchor.userData.displayedScore=shown.score;
    slot('score',scoreAnchor,shown.score,g=>text(g,String(shown.score).padStart(2,'0'),0,0,{size:22,align:'right',maxWidth:91}));
    const latest=celebrations.at(-1),age=latest?.age??Infinity;
    recharge.visible=Boolean(!reducedMotion&&latest&&latest.result.reward>0&&age<1.15);
    if(recharge.visible){
      const base=inOvertime?normalCapacity:0,range=inOvertime?extraCapacity:normalCapacity;
      const from=clamp01((latest.startTime-base)/range),to=clamp01((shown.time-base)/range);
      recharge.position.x=20+from*320;recharge.scale.x=Math.max(.001,to-from);
      recharge.material.uniforms.opacity.value=.28*(1-clamp01((age-.4)/.75));
    }
  }

  // Every menu, filter, keyboard key and list row is a raycastable mesh.
  const dim=new THREE.Mesh(new THREE.PlaneGeometry(360,640),new THREE.MeshBasicMaterial({color:'#604d6d',transparent:true,opacity:.82,depthWrite:false}));
  dim.position.set(180,-320,20);modal.add(dim);
  const menuContent=group(modal,0,0,23);
  const compliment=wordCount=>wordCount<3?"You've got potential!":wordCount<10?'Good job!':wordCount<25?'Wonderful word work!':'What a word wizard!';
  const formatDate=value=>{if(!value)return 'This device';const date=new Date(value);return Number.isNaN(date.valueOf())?'This device':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});};
  const entryList=view=>Array.isArray(view.book?.entries)?view.book.entries:[];
  function filteredEntries(view){
    let entries=entryList(view).slice();
    const filter=String(view.wordbookFilter||'all'),query=String(view.wordbookQuery||'').trim().toUpperCase();
    if(view.wordbookOnlyNew){const fresh=new Set((view.roundSummary?.newWords||[]).map(word=>String(word).toUpperCase()));entries=entries.filter(entry=>fresh.has(entry.word.toUpperCase()));}
    if(filter!=='all')entries=entries.filter(entry=>filter==='8+'?entry.length>=8:entry.length===Number(filter));
    if(query)entries=entries.filter(entry=>entry.word.toUpperCase().includes(query));
    const sort=view.wordbookSort||'recent';
    entries.sort(sort==='alpha'?(a,b)=>a.word.localeCompare(b.word):sort==='played'?(a,b)=>b.timesPlayed-a.timesPlayed||a.word.localeCompare(b.word):(a,b)=>new Date(b.firstSeen)-new Date(a.firstSeen)||a.word.localeCompare(b.word));
    return entries;
  }
  function menu(game,view) {
    const book=view.book||{},stats=book.stats||{},report=view.roundSummary||book.round||{};
    const key=JSON.stringify([mode,game.score,game.wordCount,view.roundBest,collectionPage,book.totalWords,stats.totalWordsPlayed,stats.roundsPlayed,stats.personal,view.statsView,book.goal,book.storageStatus,report.roundId,report.newWordCount,view.settings,view.wordbookFilter,view.wordbookSort,view.wordbookQuery,view.wordbookPage,view.wordbookOnlyNew,view.wordDetail,view.menuReturn]);
    slot('menu',menuContent,key,g=>{
      const action=(id,label,x,y,w,h,options={})=>button(g,id,label,x,y,w,h,options);
      const title=(eyebrow,heading,y=96)=>{if(eyebrow)text(g,eyebrow,180,y,{size:6.2,align:'center',spacing:.5,material:'muted',maxWidth:280});text(g,heading,180,y+22,{size:25,align:'center',raised:true,maxWidth:290});};
      const back=(label='Back',id='menu',y=557)=>action(id,label,34,y,292,42,{primary:true});
      if(mode==='paused'){
        plinth(g,24,197,312,278,20);
        text(g,'Paused',180,224,{size:29,align:'center',raised:true});
        back('Keep Playing','menu',289);
        action('settings','Settings',45,354,128,38);action('help','How to Play',187,354,128,38);
        action('restart','Start Again',84,415,192,32,{small:true});
      }else if(mode==='over'){
        const preview=[...game.words].reverse().slice(0,8);
        const rows=preview.length?Math.ceil(preview.length/2):3,shrink=(4-rows)*28;
        g.position.y=-shrink/2;
        plinth(g,18,104,324,511-shrink,20);
        text(g,compliment(game.wordCount),180,127,{size:24,align:'center',raised:true,maxWidth:290});
        text(g,game.score,180,175,{size:53,align:'center',maxWidth:278,raised:true});
        text(g,`${game.wordCount} ${game.wordCount===1?'word':'words'} found`,180,241,{size:12,align:'center'});
        const fresh=report.newWords||[],newCount=report.newWordCount??fresh.length;
        if(preview.length){
          const words=action('collection','',34,278,292,120-shrink,{quiet:true});words.label=`Your round: ${game.words.join(', ')}. View all words.`;
          preview.forEach((word,i)=>{
            const x=8+(i%2)*144,y=5+Math.floor(i/2)*28;
            panel(words.face,x,y,132,23,'cream',7,0,1.5);
            text(words.face,word,x+66,y+5,{size:9,align:'center',maxWidth:116,z:5});
          });
          if(game.wordCount>8)text(g,`See all ${game.wordCount} words`,180,404,{size:7.5,align:'center',material:'muted'});
        }else{
          icon(g,'star',180,311,{scale:1.3,material:'goldInk'});
          lines(g,'Every word starts with a letter.\nGive it another go!',180,345,{size:10,lineHeight:19,align:'center',material:'ink'});
        }
        if(newCount){
          action('results-new',`${newCount} new ${newCount===1?'discovery':'discoveries'}`,79,424-shrink,202,22,{gold:true,round:true,small:true});
        }
        action('start','Play Again',72,463-shrink,216,50,{primary:true,centered:true});
        action('wordbook','Word Book',34,532-shrink,141,38);
        action('stats','Your Progress',185,532-shrink,141,38);
        action('home','Home',135,582-shrink,90,22,{quiet:true,small:true});
      }else if(mode==='settings'){
        plinth(g,18,80,324,539,18);title('','Settings',101);
        const settings=view.settings||{};
        const rows=[['effects','Sound effects','A soft sound for letters and words.'],['music','Ambient music','A quiet backdrop to your round.'],['haptics','Haptics','Light taps on supported devices.'],['reducedMotion','Reduced motion','Less bounce, shimmer and decorative motion.']];
        rows.forEach(([id,label,detail],i)=>{const y=180+i*82;panel(g,34,y,292,67,'cream',10);text(g,label,47,y+12,{size:10});text(g,detail,47,y+39,{size:6.4,maxWidth:260,material:'muted'});const toggle=action(`setting:${id}`,settings[id]?'On':'Off',258,y+6,56,28,{small:true});toggle.label=`${label}: ${settings[id]?'on':'off'}`;});
        if(book.storageStatus?.state==='unavailable')text(g,'Changes last for this visit',180,519,{size:7,align:'center',material:'muted'});
        back();
      }else if(mode==='help'){
        plinth(g,18,61,324,559,18);title('','How to Play',81);
        const sections=[
          ['Catch letters. Make words.',`Tap letters in order. Tap the paper plane to submit ${config.rules.minWordLength} or more letters.`],
          ['Longer words, more thinking time.',letterTimingCopy],
          ['Watch your word bar.',`When it runs out, a valid word submits for you. Unfinished words clear. Words you already scored earn 0 points, with no time penalty.`],
          ['Keep the round going.',`6 letters: refill to ${fmt(sixLetterTarget)}s, or +${fmt(config.rewards.sixLetterBonusSeconds)}s above it. 7: a full bar. 8+: ${overtimePercent}% overtime. A ? matches any letter.`],
          ['Meet a little magic.',`${config.specialTiles.goldUnlockWords} words: gold doubles your word score. ${config.specialTiles.iceUnlockWords} words: ice slows time. ${config.specialTiles.smokeUnlockWords} words: magenta brings smoke. ${config.specialTiles.fireUnlockWords} words: fire speeds up letters for ${fmt(config.fire.durationSeconds)}s; clocks stay normal. Only one timed effect can run at once.`],
        ];
        sections.forEach(([heading,body],i)=>{const y=151+i*70;text(g,heading,36,y,{size:10});lines(g,body,36,y+20,{width:286,size:7.5,lineHeight:12});});
        text(g,`Clear: -${fmt(config.penalties.clearWordSeconds)}s. Invalid word: -${fmt(config.penalties.invalidWordSeconds)}s.`,180,520,{size:6.8,align:'center',material:'muted'});
        back('Got it');
      }else if(mode==='collection'){
        plinth(g,24,130,312,408,18);title('','Your Words',151);
        const words=[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8);
        words.forEach((word,i)=>{const x=45+(i%2)*142,y=230+Math.floor(i/2)*43;panel(g,x,y,128,33,'cream',6);text(g,word,x+9,y+8,{size:10,maxWidth:88});text(g,game.collectedPoints(word),x+118,y+11,{size:7,align:'right',material:'muted'});});
        const previous=action('previous','<',45,420,44,32),next=action('next','>',271,420,44,32);previous.enabled=collectionPage>0;next.enabled=collectionPage<collectionPages-1;
        text(g,`${collectionPage+1} / ${collectionPages}`,180,431,{size:8,align:'center',material:'muted'});
        back('Back','menu',475);
      }else if(mode==='wordbook'){
        plinth(g,12,72,336,551,18);title(view.wordbookOnlyNew?'NEW DISCOVERIES':'','Word Book',91);
        text(g,`${book.totalWords||0} different words discovered`,180,148,{size:8,align:'center',material:'muted'});
        action('book-query',view.wordbookQuery?`Search: ${view.wordbookQuery}`:'Search your words',25,171,310,34);
        const filters=['all','3','4','5','6','7','8+'];
        filters.forEach((filter,i)=>{const c=action(`book-filter:${filter}`,filter==='all'?'All':filter,25+i*45,217,40,29,{small:true});if(String(view.wordbookFilter||'all')===filter){panel(c.face,8,24,24,2,'ink',1,5,.4);}});
        [['recent','Newest'],['alpha','A to Z'],['played','Most played']].forEach(([sort,label],i)=>{const c=action(`book-sort:${sort}`,label,25+i*105,258,100,28,{small:true});if((view.wordbookSort||'recent')===sort)panel(c.face,36,23,28,2,'ink',1,5,.4);});
        const entries=filteredEntries(view);bookPages=Math.max(1,Math.ceil(entries.length/5));const page=Math.max(0,Math.min(Number(view.wordbookPage)||0,bookPages-1));
        entries.slice(page*5,page*5+5).forEach((entry,i)=>{const y=298+i*39;const row=action(`book-word:${entry.word}`,'',25,y,310,33);row.label=`${entry.word}, ${entry.length} letters, played ${entry.timesPlayed} ${entry.timesPlayed===1?'time':'times'}`;text(row.face,entry.word,12,8,{size:10.5,maxWidth:170});text(row.face,`${entry.length} letters  /  ${entry.timesPlayed} ${entry.timesPlayed===1?'play':'plays'}`,297,12,{size:6.4,align:'right',material:'muted',maxWidth:114});});
        if(!entries.length)lines(g,entryList(view).length?'No words match just yet.\nTry another length or search.':'Your first discovery starts here.\nPlay a round to collect your words.',180,365,{width:280,size:9,lineHeight:18,align:'center'});
        const previous=action('book-prev','<',25,508,44,32),next=action('book-next','>',291,508,44,32);previous.enabled=page>0;next.enabled=page<bookPages-1;
        text(g,`${entries.length} ${entries.length===1?'word':'words'}  /  ${page+1} of ${bookPages}`,180,519,{size:7.3,align:'center',material:'muted'});
        back(view.wordbookOnlyNew?'Back to results':'Back','menu',558);
        text(g,book.storageStatus?.state==='unavailable'?'Storage unavailable - words last for this visit':'Saved on this device',180,609,{size:5.8,align:'center',material:'muted'});
      }else if(mode==='word-detail'){
        plinth(g,18,88,324,531,18);title('','Word Details',108);
        const word=typeof view.wordDetail==='string'?view.wordDetail:view.wordDetail?.word;
        const entry=entryList(view).find(item=>item.word===word)||view.wordDetail||{};
        text(g,entry.word||'',180,183,{size:31,align:'center',maxWidth:283,raised:true});
        text(g,`${entry.length||0} letters`,180,230,{size:9,align:'center',material:'muted'});
        const facts=[['First discovered',formatDate(entry.firstSeen)],['Last played',formatDate(entry.lastSeen)],['Times played',String(entry.timesPlayed||0)],['Best word score',`${entry.bestPoints||0} points`],['Without a wildcard',entry.withoutBlanks?'Played':'Not yet']];
        facts.forEach(([label,value],i)=>{const y=277+i*36;text(g,label,39,y,{size:8,material:'muted'});text(g,value,321,y,{size:8,align:'right',maxWidth:150});});
        back('Back to Word Book','book-back');
      }else if(mode==='search'){
        plinth(g,12,90,336,531,18);title('','Find a Word',112);
        panel(g,25,183,310,49,'cream',10);text(g,view.wordbookQuery||'Type a word...',40,198,{size:18,maxWidth:280,material:view.wordbookQuery?'ink':'muted'});
        text(g,'Search matches any part of a collected word.',180,251,{size:7,align:'center',material:'muted'});
        const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
        rows.forEach((row,r)=>{const width=29,gap=3,total=row.length*(width+gap)-gap,left=(360-total)/2;[...row].forEach((letter,i)=>action(`key:${letter}`,letter,left+i*(width+gap),303+r*49,width,40,{small:true}));});
        action('key:backspace','Delete',25,462,148,36);action('book-clear-query','Clear search',187,462,148,36);
        back('Show matching words','key:done');
      }else if(mode==='goals'){
        plinth(g,18,71,324,550,18);title('','Your Goals',92);
        text(g,'Optional goals. No deadlines. No score bonuses.',180,150,{size:7,align:'center',material:'muted'});
        const goals=book.goals||[];
        goals.slice(0,5).forEach((goal,i)=>{const y=184+i*62;const row=action(`goal:${goal.id}`,'',34,y,292,51);row.label=`${goal.title}, ${goal.current} of ${goal.target}${book.goal?.id===goal.id?', selected':''}`;text(row.face,goal.title,12,10,{size:9.2,maxWidth:235});text(row.face,`${goal.current} / ${goal.target}${goal.complete?'  complete':''}`,12,31,{size:6.8,material:'muted'});if(book.goal?.id===goal.id)text(row.face,'ON',277,20,{size:7,align:'right',material:'ink'});});
        action('goal:none','Just play',75,510,210,28,{quiet:true});
        back();
      }else if(mode==='stats'){
        plinth(g,18,71,324,550,18);title('','Your Progress',92);
        const recent=view.statsView==='recent';
        [['lifetime','All your words'],['recent','Recent play']].forEach(([id,label],i)=>{
          const tab=action(`stats-view:${id}`,label,34+i*150,155,142,30,{small:true});
          tab.label=`${label}${(id==='recent')===recent?', selected':''}`;
          if((id==='recent')===recent)panel(tab.face,56,25,30,2,'ink',1,5,.4);
        });
        if(recent){
          const personal=stats.personal||{},observed=Math.max(0,Math.floor(personal.observedSeconds||0));
          text(g,'RECENT ACTIVE PLAY / UP TO 20 MINUTES',180,208,{size:6.7,align:'center',spacing:.2,material:'muted'});
          text(g,`${Math.floor(observed/60)}m ${String(observed%60).padStart(2,'0')}s observed`,180,230,{size:19,align:'center',maxWidth:290,raised:true});
          text(g,'Different words played without wildcards',180,269,{size:7.4,align:'center',material:'muted'});
          panel(g,34,299,292,87,'cream',11);
          [5,6,7].forEach((length,i)=>{const x=82+i*98;text(g,personal.distinctByLength?.[length]||0,x,313,{size:27,align:'center',maxWidth:80});text(g,`${length} letters`,x,357,{size:7.5,align:'center',material:'muted'});});
          lines(g,personal.complete?'Your latest 20 minutes of active play.\nEarlier words leave this window as you keep playing.':'Your 20-minute window is still filling.\nOnly active play counts; pauses are excluded.',180,406,{width:284,size:7,lineHeight:15,align:'center'});
          text(g,'Each word counts once in this window.',180,448,{size:6.6,align:'center',material:'muted'});
        }else{
          text(g,book.totalWords||0,180,201,{size:33,align:'center',raised:true});
          text(g,'different words discovered',180,245,{size:8,align:'center',material:'muted'});
          const facts=[['Rounds played',stats.roundsPlayed||0],['Personal best',stats.bestScore||view.best||0],['Words played',stats.totalWordsPlayed||0],['Longest word',stats.longestWord||'Your next discovery']];
          facts.forEach(([label,value],i)=>{const y=280+i*27;text(g,label,36,y,{size:8,material:'muted'});text(g,value,324,y,{size:8.5,align:'right',maxWidth:174});});
          panel(g,34,391,292,62,'cream',10);text(g,'WORDS BY LENGTH',47,402,{size:6.2,spacing:.5,material:'muted'});
          ['3','4','5','6','7','8+'].forEach((length,i)=>{const count=length==='8+'?Object.entries(book.lengthCounts||{}).reduce((sum,[key,n])=>sum+(Number(key)>=8?n:0),0):(book.lengthCounts?.[length]||0);const x=58+i*47;text(g,count,x,419,{size:12,align:'center'});text(g,length,x,439,{size:5.8,align:'center',material:'muted'});});
        }

        back();
      }
    });
  }

  return {
    scene,
    resize(layout){
      currentLayout=layout;
      hud.position.y=homeHud.position.y=status.position.y=rewardLayer.position.y=layout.height/2-layout.top;
      intro.position.y=320+(layout.bottom-layout.top)/2;
      playing.position.y=640-layout.height/2+layout.bottom;
      dim.scale.set(layout.width/360,layout.height/640,1);
    },
    obscures(x,y,margin=0){
      if(mode)return true;
      if(!currentLayout)return false;
      if(overlapsPanel(x,y,currentLayout,margin))return true;
      const localX=x-currentLayout.left,localY=y-currentLayout.top;
      return effectsVisible&&localX>137-margin&&localX<223+margin&&localY>86-margin&&localY<108+margin;
    },
    get blocking(){return Boolean(mode);},
    sync(game,view) {
      if(game.phase==='over'&&phase!=='over'){clearScoreFlights();clearGoldCelebration();}
      phase=game.phase;mode=view.mode;collectionPages=Math.max(1,Math.ceil(game.wordCount/8));collectionPage=Math.max(0,Math.min(view.collectionPage||0,collectionPages-1));
      intro.visible=homeHud.visible=phase==='ready';playing.visible=phase==='running'||phase==='paused';modal.visible=Boolean(mode);
      hud.visible=phase==='running'||phase==='paused';
      syncMeters(game);
      rewardLayer.visible=phase==='running'&&!mode;
      pause.enabled=phase==='running';pause.root.visible=phase!=='ready';
      slot('storageStatus',intro,view.book?.storageStatus?.state||'',g=>{if(view.book?.storageStatus?.state==='unavailable')text(g,'Discoveries saved for this visit',180,583,{size:6,align:'center',material:'muted',maxWidth:310});});
      const signature=game.current+game.currentTiles.map(t=>`${t.blank?'?':t.bonus?'1':'0'}:${t.effect||''}`).join('')+phase+':'+game.letterWindow;
      letterTimer.visible=Boolean(game.current)&&phase!=='over';
      letterTimer.scale.x=Math.max(.001,game.letterSeconds/game.letterWindow);
      letterTimer.material=materials[game.effects.hourglass>0?'ice':'ink'];
      slot('word',submit.face,signature,g=>{
        if(game.current)text(g,game.current,13,12,{size:24,maxWidth:184,raised:true,colors:game.currentTiles.map(t=>t.blank?'muted':t.effect==='smoke'?'smoke':t.effect==='hourglass'?'iceInk':t.effect==='fire'?'fireInk':t.bonus?'goldInk':'letterInk'),z:7});
        else text(g,'Catch letters...',13,22,{size:10,material:'muted',maxWidth:184,z:7});
      });
      setEnabled(submit,phase==='running'&&Boolean(game.current));setEnabled(undo,phase==='running'&&Boolean(game.current));
      submit.label=game.current?`Submit ${game.current}`:'Submit current word';undo.label=`Clear whole word, ${fmt(config.penalties.clearWordSeconds)} second penalty`;
      const smoke=game.effects.smoke>0;
      effectsVisible=phase==='running'&&smoke;status.visible=phase!=='ready';
      slot('effects',status,smoke,g=>{
        if(smoke){panel(g,137,86,86,22,'smoke',11);text(g,'SMOKE',180,93,{size:6.7,align:'center',material:'smokeInk'});}
      });
      slot('feedback',playing,`${view.feedback}:${view.feedbackKind}`,g=>{
        if(view.feedback)lines(g,view.feedback,180,522,{width:300,size:7.3,lineHeight:12,align:'center',material:view.feedbackKind==='bad'?'danger':'ink'});
      });
      if(mode)menu(game,view);
      focus=view.focus;hover=view.hover;
      for(const c of controls){
        const active=c.enabled&&(c.id===focus||c.id===hover);
        c.marker.visible=c.enabled&&c.id===focus;
        if(c.primary)c.body.material=materials[active?'primaryHover':'primary'];
        if(!c.primary&&!c.quiet)c.body.material=materials[c.enabled?(c.gold?(active?'goldLight':'gold'):(active?'cream':'paper')):'pale'];
        c.face.position.z=active?1:0;c.face.position.y=0;
      }
    },
    buttons(){return enabledControls().map(c=>({id:c.id,label:c.label}));},
    hit(raycaster){
      const targets=enabledControls();
      const hits=raycaster.intersectObjects(targets.map(c=>c.body),false);
      return hits[0]?.object.userData.control.id||null;
    },
    focusNext(current,direction=1){const list=enabledControls();if(!list.length)return '';const at=list.findIndex(c=>c.id===current);return list[at<0?(direction>0?0:list.length-1):(at+direction+list.length)%list.length].id;},
    collectionPages(){return collectionPages;},
    wordbookPages(){return bookPages;},
    setReducedMotion(value){reducedMotion=Boolean(value);if(reducedMotion){meters.reset();clearScoreFlights();}},
    selectionTarget(index,kind='letter'){return kind==='hourglass'?{x:(currentLayout?.left||0)+180,y:(currentLayout?.top||0)+65}:{x:(currentLayout?.left||0)+109+Math.min(index||0,7)*21,y:(currentLayout?.height||640)-(currentLayout?.bottom||0)-59};},
    press(action,now){lastPress=action;pressUntil=now+120;},
    celebrate,
    reset(){clearGoldCelebration();for(const item of celebrations)removeCelebration(item);celebrations.length=0;meters.reset();clearScoreFlights();recharge.visible=false;},
    animate(now,dt,game){
      const activeDt=game.phase==='running'?dt:0;
      if(goldCelebration){goldCelebration.age+=activeDt;if(goldCelebration.age>=1.6)clearGoldCelebration();else animateGoldCelebration();}
      meters.advance(activeDt);scoreSettleAge+=activeDt;
      const arrivals=scoreLedger.advance(activeDt);if(arrivals.length&&!reducedMotion)scoreSettleAge=0;
      for(let i=scoreFlights.length-1;i>=0;i--){
        const item=scoreFlights[i],end=item.reduced?.35:item.flight.duration;
        if(item.flight.age+1e-9>=end){removeCelebration(item);scoreLedger.retire(item.flight.id);scoreFlights.splice(i,1);}else animateScoreFlight(item);
      }
      scoreAnchor.scale.setScalar(reducedMotion?1:1+.055*Math.sin(Math.PI*clamp01(scoreSettleAge/.16)));
      for(const {tile,angle,index} of brandTiles){tile.position.y=-191+(reducedMotion?0:Math.sin(now*.0013+index*.8)*2);tile.rotation.z=angle+(reducedMotion?0:Math.sin(now*.001+index)*.012);}
      for(let i=celebrations.length-1;i>=0;i--){
        const item=celebrations[i];item.age+=activeDt;
        if(item.age>=config.celebration.durationSeconds){removeCelebration(item);celebrations.splice(i,1);}else animateCelebration(item);
      }
      syncMeters(game);
      for(const c of controls){
        const pressed=c.id===lastPress&&now<pressUntil,active=c.enabled&&(c.id===focus||c.id===hover);
        c.face.position.y=pressed?-2.5:0;c.face.position.z=pressed?-2:(active?1:0);
      }
    },
    description(game,view){
      if(mode==='paused')return 'Paused. Your letters and timers are saved. Keep Playing when you are ready.';
      if(mode==='over')return `Round complete. ${compliment(game.wordCount)} ${game.score} points from ${game.wordCount} ${game.wordCount===1?'word':'words'}. Your words: ${game.words.join(', ')||'none yet'}. ${(view.roundSummary?.newWords||[]).length} new ${(view.roundSummary?.newWords||[]).length===1?'discovery':'discoveries'}. Play Again, Word Book, and Your Progress are available.`;
      if(mode==='settings')return `Settings. ${Object.entries(view.settings||{}).map(([key,value])=>`${key} ${value?'on':'off'}`).join('. ')}. Settings are saved on this device when local storage is available.`;
      if(mode==='wordbook')return `Wordbook. ${view.book?.totalWords||0} words discovered. Filter ${view.wordbookFilter||'all'}, sort ${view.wordbookSort||'recent'}. Search ${view.wordbookQuery||'empty'}. ${filteredEntries(view).length} matching words. Page ${(view.wordbookPage||0)+1} of ${bookPages}.`;
      if(mode==='word-detail'){const entry=entryList(view).find(entry=>entry.word===(typeof view.wordDetail==='string'?view.wordDetail:view.wordDetail?.word));return entry?`${entry.word}. ${entry.length} letters. First discovered ${formatDate(entry.firstSeen)}. Last played ${formatDate(entry.lastSeen)}. Played ${entry.timesPlayed} ${entry.timesPlayed===1?'time':'times'}. Best word score ${entry.bestPoints}. ${entry.withoutBlanks?'Played without a wildcard.':'Not yet played without a wildcard.'}`:'Word details.';}
      if(mode==='search')return `Search your Wordbook. Query: ${view.wordbookQuery||'empty'}. Use the letter buttons or your keyboard, then Show matching words.`;
      if(mode==='goals')return `Optional goals. ${view.book?.goal?`${view.book.goal.title}: ${view.book.goal.current} of ${view.book.goal.target}.`:'No goal selected.'} No deadlines or score bonuses.`;
      if(mode==='stats'){const personal=view.book?.stats?.personal||{};return view.statsView==='recent'?`Recent play. ${Math.floor(personal.observedSeconds||0)} seconds observed in your latest 20 minutes of active play. Distinct words played without wildcards: ${[5,6,7].map(length=>`${length} letters: ${personal.distinctByLength?.[length]||0}`).join(', ')}. Each word counts once in this window. ${personal.complete?'Full window.':'The window is still filling.'}`:`Personal progress. ${view.book?.totalWords||0} different words discovered. ${view.book?.stats?.roundsPlayed||0} ${(view.book?.stats?.roundsPlayed||0)===1?'round':'rounds'} played. Best score ${view.book?.stats?.bestScore||view.best||0}.`;}
      if(mode==='help')return `How to Play. Tap letters in order and submit ${config.rules.minWordLength} or more letters. ${letterTimingCopy} When the letter bar expires, a valid word submits automatically. Repeated words earn 0 points with no time penalty. New words add time. ${timeRewardCopy} A blank ? resolves when you submit and scores zero. Pausing freezes both timers. Gold tiles first appear after ${config.specialTiles.goldUnlockWords} words and double the word score. Ice tiles first appear after ${config.specialTiles.iceUnlockWords} scored words and slow time for ${fmt(config.hourglass.durationSeconds)} seconds. Magenta smoke tiles appear after ${config.specialTiles.smokeUnlockWords} words and pulse when ready to burst. Fire tiles appear after ${config.specialTiles.fireUnlockWords} words and make falling letters, rotation and arrivals ${fmt(config.fire.worldTimeScale)} times faster for ${fmt(config.fire.durationSeconds)} seconds. Both timers keep their normal pace during fire. Only one timed effect can run at once. Each round resets these milestones. ${config.difficulty.enabled?`Letter Y spin starts at zero, ramps up over ${fmt(config.difficulty.rampSeconds)} active seconds, then smoothly rises and falls randomly within its speed limits.`:'Letter Y spin stays at zero.'} Clear costs ${fmt(config.penalties.clearWordSeconds)} seconds; invalid words cost ${fmt(config.penalties.invalidWordSeconds)} seconds.`;
      if(mode==='collection')return `Collected words, page ${collectionPage+1} of ${collectionPages}: ${[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8).join(', ')}.`;
      const latest=celebrations.at(-1),reward=latest?` ${latest.result.word}: +${latest.result.points} points. ${latest.result.reward>0?`+${fmt(latest.result.reward)} seconds.`:'Maximum time.'}`:'';
      return phase==='ready'?'CLTTR. Catch letters. Discover your next word.':`Score ${game.score}.${game.remaining>config.timer.maxSeconds?` Overtime ${Math.ceil(game.remaining/config.timer.maxSeconds*100)}%.`:''} Current word: ${game.current||'empty'}.${game.current?` Next letter or automatic submission in ${game.secondsUntilWordTimeout.toFixed(1)} seconds. Letter window ${fmt(game.letterWindowSeconds)} seconds.`:''}${reward} ${view.feedback}${goldCelebration?' Double Score! This word earned twice the points.':''}`;
    },
  };
}
