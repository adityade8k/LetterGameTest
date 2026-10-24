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
    ink: celMaterial(palette.plum), cream: celMaterial(palette.cream),
    gold: celMaterial(palette.gold), mint: celMaterial(palette.mint),
    paper: celMaterial(['#ffefd3', '#e0b69e']),
    muted: celMaterial(['#ac7e78', '#926770']),
    pale: celMaterial(['#e9c5a8', '#d7a78e']),
    primary: celMaterial(['#70445f', '#55364e']),
    primaryHover: celMaterial(['#85546f', '#64415b']),
    lightText: celMaterial(['#ffefd3', '#e4c49e']),
    edge: celMaterial(['#c19b8b', '#957184']),
    primaryEdge: celMaterial(['#50344d', '#3e2940']),
    danger: celMaterial(['#bb545c', '#8d4355']),
  };
  const geometryCache = new Map(), glyphCache = new Map(), slots = new Map();
  const controls = [];
  const point = (x, y, z = 0) => new THREE.Vector3(x - 180, 320 - y, z);
  const fmt = n => String(Number(n.toFixed(2)));
  // Guard presentation-only timings without changing any game clock.
  const presentationSeconds=(value,fallback)=>Number.isFinite(value)&&value>0?Math.max(.05,Math.min(2,value)):fallback;
  const successSeconds=presentationSeconds(config.engagement?.successSeconds,.28);
  const discoverySeconds=presentationSeconds(config.engagement?.discoverySeconds,.6);
  let phase = 'ready', mode = '', focus = '', hover = '', lastPress = '', pressUntil = 0;
  let collectionPage = 0, collectionPages = 1, bookPages = 1;
  let latestView={}, settleAge=Infinity, resolvedWord='', resolvedLetters=[], latestRecentRoot=null, sessionNewWords=new Set();
  const meters=new RewardMeters(config.celebration),celebrations=[];
  const scoreLedger=new ScoreFlights({durationSeconds:config.engagement?.scoreFlightSeconds}),scoreFlights=[];
  let scoreSettleAge=Infinity;
  let lastBest=0,currentLayout=null,effectsVisible=false;

  function group(parent = scene, x = 0, y = 0, z = 0) {
    const object = new THREE.Group();
    object.position.copy(parent === scene ? point(x, y, z) : new THREE.Vector3(x, -y, z));
    parent.add(object); return object;
  }
  // Root groups use screen coordinates; children use local offsets.
  const hud = group(scene), intro = group(scene), playing = group(scene), modal = group(scene),status=group(scene);
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
    const g=new THREE.Group();g.position.set(x-(align==='center'?originalWidth*scale/2:align==='right'?originalWidth*scale:0),-y-size*scale,z);g.scale.setScalar(scale);parent.add(g);
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
    const g=createIcon(kind,materials[material],accent?materials[accent]:['hourglass','grenade'].includes(kind)?materials.gold:materials[material]);
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
    panel(parent,x+1,y+4,w,h,'edge',r,-3,3);
    return panel(parent,x,y,w,h,'paper',r,-1,3);
  }
  function button(parent,id,label,x,y,w,h,{primary=false,quiet=false,iconName,small=false}={}) {
    const root=group(parent,x,y,1);
    if(!quiet){dropShadow(root,0,1,w,h,primary?11:8,-4);panel(root,0,3,w,h,primary?'primaryEdge':'edge',primary?11:8,-2,2);}
    const body=panel(root,0,0,w,h,primary?'primary':quiet?'cream':'paper',primary?11:8,0,primary?4:2);
    // Quiet actions still have actual mesh hit surfaces; they are never DOM targets.
    if(quiet){body.material=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});}
    const c={id,label,root,body,enabled:true,primary,quiet,w,h,layoutY:y};controls.push(c);
    body.userData.control=c;
    if(label)text(root,label,primary?17:w/2,(h-(small?7.5:primary?12:9))/2-1,{size:small?7.5:primary?12:9,align:primary?'left':'center',material:primary?'lightText':'ink',maxWidth:w-(primary?55:12),z:5});
    if(primary)icon(root,'arrow',w-22,h/2,{material:'lightText',scale:.8,z:5});
    if(iconName)icon(root,iconName,w/2,h/2,{z:5});
    const marker=panel(root,w/2-6,h+3,12,2,'gold',1,2,.5);marker.visible=false;c.marker=marker;
    return c;
  }
  function isWithin(object,parent){for(let o=object;o;o=o.parent)if(o===parent)return true;return false;}
  function ancestorsVisible(object){for(let o=object;o;o=o.parent){if(!o.visible)return false;if(o===scene)return true;}return false;}
  function enabledControls(){
    return controls.filter(c=>c.enabled&&ancestorsVisible(c.root)&&(mode?isWithin(c.root,modal):!isWithin(c.root,modal)));
  }
  function setEnabled(c,enabled){c.enabled=enabled;c.body.material=materials[enabled?(c.primary?'primary':'paper'):'pale'];}

  // Raised header first, then a recessed clock channel, then the falling field.
  plinth(hud,12,10,336,99,15);
  text(hud,'CLTTR',22,24,{size:27,spacing:-.8,maxWidth:165,raised:true});
  text(hud,'POINTS',244,25,{size:5.5,align:'right',spacing:.6});
  text(hud,'BEST',291,25,{size:5.5,align:'right',spacing:.6});
  const pause=button(hud,'pause','',307,19,34,36,{iconName:'pause'});
  pause.label='Pause game';
  panel(hud,22,83,316,12,'edge',6,2,.5);
  panel(hud,24,84,312,8,'pale',4,3,.5);
  const timer=panel(hud,25,85,310,6,'ink',3,4,.6);
  const overtime=panel(hud,25,85,310,6,'gold',3,5.4,.4);
  overtime.visible=false;
  const recharge=panel(hud,25,84,310,8,'mint',3,6.5,.4);
  recharge.material=materials.mint.clone();recharge.material.transparent=true;recharge.material.depthWrite=false;recharge.visible=false;
  const scoreAnchor=group(hud,244,39),clockAnchor=group(hud,338,65);

  plinth(intro,12,320,336,305,16);
  text(intro,'MAKE SOMETHING OF THE FALL.',180,337,{size:6.5,align:'center',spacing:.45});
  text(intro,'A little word wonder.',180,359,{size:24,align:'center',maxWidth:308,raised:true});
  text(intro,'Catch letters. Discover your next word.',180,397,{size:8.4,align:'center',maxWidth:300,material:'muted'});
  button(intro,'start',"Let's play",26,424,308,46,{primary:true});
  const homeBook=button(intro,'wordbook','',26,485,146,36);
  button(intro,'stats','Your progress',188,485,146,36);
  button(intro,'help','How to play',26,534,146,36);
  button(intro,'settings','Settings',188,534,146,36);
  const homeGoal=button(intro,'goals','',26,583,308,28,{quiet:true});

  plinth(playing,12,470,336,151,15);
  text(playing,'YOUR WORD',22,480,{size:6.7,spacing:.5});
  const submit=button(playing,'submit','',76,498,262,46);
  icon(submit.root,'paperPlane',239,22,{material:'ink',accent:'paper',scale:.8,z:5});
  const undo=button(playing,'undo','',22,498,46,46);
  icon(undo.root,'trash',23,15,{material:'ink',accent:'paper',scale:.78,z:5});text(undo.root,`-${fmt(config.penalties.clearWordSeconds)}s`,23,29,{size:6.7,align:'center',material:'muted',z:5});
  const letterTimer=panel(submit.root,13,41,230,2,'ink',1,7,.25);
  letterTimer.visible=false;
  text(playing,'WORDS COLLECTED',22,561,{size:6.7,spacing:.5});
  const collection=button(playing,'collection','',20,553,320,49,{quiet:true});collection.label='View collected words';

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
  function flightOrigin(word){
    const width=Math.min(205,measure(word||'',24));
    return {x:Math.min(281,89+width/2),y:(currentLayout?.height||640)-(currentLayout?.bottom||0)-(currentLayout?.top||0)-119};
  }
  function addScoreFlight(result){
    const flight=scoreLedger.add(result.points,{immediate:reducedMotion});if(!flight)return;
    const root=group(rewardLayer,0,0,14),badge=group(root);
    const label=`+${result.points}`,width=Math.max(32,measure(label,12)+17);
    panel(badge,-width/2,-12,width,24,'cream',12,0,1.5);
    text(badge,label,0,-6,{size:12,align:'center',material:'ink',raised:true,z:4});
    const item={root,badge,materials:fadeMaterials(root),flight,word:result.word,from:flightOrigin(result.word),to:{x:232,y:47},lane:(flight.id%3)-1,reduced:reducedMotion};
    // These are diagnostic scene labels, never interactive control targets.
    root.userData.scoreFlight=flight;scoreFlights.push(item);animateScoreFlight(item);
  }
  function animateScoreFlight(item){
    item.from=flightOrigin(item.word);
    const pose=scoreFlightPose(item.flight,item.from,item.to,{reducedMotion:item.reduced,lane:item.lane});
    item.badge.position.set(pose.x,-pose.y,0);item.badge.scale.setScalar(pose.scale);setAlpha(item.materials,pose.alpha);
  }
  function celebrate(result,game){
    meters.add(result.reward,0);addScoreFlight(result);
    settleAge=0;resolvedWord=result.word||'';resolvedLetters=result.blankIndices||result.wildcardIndices||[...(result.pattern||result.submittedPattern||'')].flatMap((letter,index)=>letter==='?'?[index]:[]);
    if(result.isNew||result.isNewWord||result.isNewDiscovery||result.discovery?.isNew)sessionNewWords.add(result.word);
    // Time labels stay coalesced; point flights retain independent arrivals.
    for(const item of celebrations)removeCelebration(item);celebrations.length=0;
    const root=group(rewardLayer),time=group(root,298,66,12);
    text(time,result.reward>0?`+${fmt(result.reward)}s`:'MAX',0,0,{size:9,align:'right',material:'muted',maxWidth:42});
    const timeMaterials=fadeMaterials(time);
    const item={root,time,materials:timeMaterials,timeMaterials,age:0,result,startTime:meters.values(game.remaining,game.score).time};
    celebrations.push(item);animateCelebration(item);
  }
  function animateCelebration(item){
    const {age,time}=item,duration=config.celebration.durationSeconds,t=clamp01(age/duration);
    const alpha=clamp01(t/.12)*(1-clamp01((t-.55)/.45));
    const rise=reducedMotion?0:2*easeOut(t);
    time.position.y=-(66-rise);setAlpha(item.timeMaterials,alpha);
  }
  function syncMeters(game){
    const shown={time:reducedMotion?game.remaining:meters.values(game.remaining,game.score).time,score:scoreLedger.value(game.score)},timeRatio=shown.time/config.timer.startSeconds;
    const extraCapacity=config.timer.maxSeconds-config.timer.startSeconds,inOvertime=shown.time>config.timer.startSeconds;
    timer.scale.x=Math.max(.001,Math.min(1,timeRatio));
    timer.material=materials[game.effects.hourglass>0?'mint':game.remaining<=config.timer.lowTimeSeconds?'danger':'ink'];
    overtime.visible=inOvertime&&extraCapacity>0;
    overtime.scale.x=Math.max(.001,Math.min(1,(shown.time-config.timer.startSeconds)/Math.max(.001,extraCapacity)));
    const timeLabel=inOvertime?`OVERTIME / ${Math.ceil(timeRatio*100)}%`:'TIME';
    slot('timeLabel',hud,timeLabel,g=>text(g,timeLabel,24,67,{size:6.2,material:'muted',spacing:.6}));
    slot('clock',clockAnchor,Math.ceil(shown.time),g=>text(g,`${Math.ceil(shown.time)}s`,0,0,{size:10,align:'right',raised:true}));
    scoreAnchor.userData.displayedScore=shown.score;
    slot('score',scoreAnchor,shown.score,g=>text(g,String(shown.score).padStart(2,'0'),0,0,{size:17,align:'right'}));
    const shownBest=['running','paused'].includes(game.phase)?Math.max(latestView.roundBest||0,Math.min(lastBest,shown.score)):lastBest;
    slot('best',hud,shownBest,g=>text(g,String(shownBest).padStart(2,'0'),291,39,{size:17,align:'right'}));
    const latest=celebrations.at(-1),age=latest?.age??Infinity;
    recharge.visible=Boolean(!reducedMotion&&latest&&latest.result.reward>0&&age<1.15);
    if(recharge.visible){
      const base=inOvertime?config.timer.startSeconds:0,range=inOvertime?extraCapacity:config.timer.startSeconds;
      const from=clamp01((latest.startTime-base)/range),to=clamp01((shown.time-base)/range);
      recharge.position.x=25+from*310;recharge.scale.x=Math.max(.001,to-from);
      recharge.material.uniforms.opacity.value=.28*(1-clamp01((age-.4)/.75));
    }
  }

  // Every menu, filter, keyboard key and list row is a raycastable mesh.
  const dim=new THREE.Mesh(new THREE.PlaneGeometry(360,640),new THREE.MeshBasicMaterial({color:'#604d6d',transparent:true,opacity:.82,depthWrite:false}));
  dim.position.set(180,-320,20);modal.add(dim);
  const menuContent=group(modal,0,0,23);
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
      const title=(eyebrow,heading,y=96)=>{text(g,eyebrow,180,y,{size:6.2,align:'center',spacing:.5,material:'muted',maxWidth:280});text(g,heading,180,y+22,{size:25,align:'center',raised:true,maxWidth:290});};
      const back=(label='Back',id='menu',y=557)=>action(id,label,34,y,292,42,{primary:true});
      if(mode==='paused'){
        plinth(g,24,186,312,311,18);title('TAKE YOUR TIME.','A little breather.',210);
        lines(g,'Your letters are right where you left them.\nThe clock can wait.',180,285,{size:8.5,align:'center',lineHeight:16});
        back('Keep going','menu',348);
        action('settings','Settings',45,410,128,34);action('help','How to play',187,410,128,34);
        action('restart','Start a fresh round',70,457,220,24,{quiet:true,small:true});
      }else if(mode==='over'){
        plinth(g,18,81,324,539,18);
        title(report.isPersonalBest?'A NEW PERSONAL BEST.':'A MOMENT WELL SPENT.','Your words add up.',102);
        text(g,game.score,180,163,{size:57,align:'center',maxWidth:278,raised:true});
        text(g,`points from ${game.wordCount} ${game.wordCount===1?'word':'words'}`,180,233,{size:9,align:'center'});
        text(g,`Personal best ${view.best||0}`,180,253,{size:7.6,align:'center',material:'muted'});
        const fresh=report.newWords||[],newCount=report.newWordCount??fresh.length;
        panel(g,34,282,292,96,'cream',12);
        text(g,newCount?`${newCount} new ${newCount===1?'word':'words'} for your Wordbook`:'Every word adds to your story.',180,296,{size:9.4,align:'center',maxWidth:266});
        if(newCount){
          const preview=fresh.slice(0,3).join('  /  ');text(g,preview,180,323,{size:11,align:'center',maxWidth:266,raised:true});
          text(g,`${book.totalWords||0} words discovered on this device`,180,353,{size:6.8,align:'center',material:'muted'});
        }else lines(g,game.wordCount?'Your familiar words have a little more history.\nYour collection is ready whenever you are.':'A fresh set of letters is waiting.\nYour Wordbook grows with every first discovery.',180,323,{size:7.6,lineHeight:15,align:'center'});
        const milestone=report.milestones?.[0];
        const note=milestone?milestone.title:report.longestWord?`Longest this round: ${report.longestWord}`:book.goal?.title?`Your goal: ${book.goal.title}`:'A little curiosity goes a long way.';
        text(g,note,180,book.goal?386:398,{size:8.3,align:'center',maxWidth:290,material:milestone?'ink':'muted'});
        if(book.goal)text(g,`${book.goal.title}  /  ${book.goal.current} of ${book.goal.target}${book.goal.complete?' - complete':''}`,180,410,{size:6.8,align:'center',maxWidth:290,material:'muted'});
        action('start','Play again',34,433,292,45,{primary:true});
        action(newCount?'results-new':'wordbook',newCount?'View new words':'View Wordbook',34,493,292,38);
        action('stats','Your progress',34,550,190,34);
        action('home','Home',242,550,84,34,{quiet:true});
      }else if(mode==='settings'){
        plinth(g,18,80,324,539,18);title('MAKE YOURSELF COMFORTABLE.','Your kind of quiet.',101);
        const settings=view.settings||{};
        const rows=[['effects','Sound effects','A soft sound for letters and words.'],['music','Ambient music','A quiet backdrop to your round.'],['haptics','Haptics','Light taps on supported devices.'],['reducedMotion','Reduced motion','Less bounce, shimmer and decorative motion.']];
        rows.forEach(([id,label,detail],i)=>{const y=180+i*82;panel(g,34,y,292,67,'cream',10);text(g,label,47,y+12,{size:10});text(g,detail,47,y+39,{size:6.4,maxWidth:260,material:'muted'});const toggle=action(`setting:${id}`,settings[id]?'On':'Off',258,y+6,56,28,{small:true});toggle.label=`${label}: ${settings[id]?'on':'off'}`;});
        lines(g,book.storageStatus?.state==='unavailable'?'Storage unavailable. Changes last for this visit.\nGame timing and rules stay the same.':'Your choices stay on this device.\nGame timing and rules stay the same.',180,519,{size:7,align:'center',lineHeight:13});
        back();
      }else if(mode==='help'){
        plinth(g,18,61,324,559,18);title('A FEW LITTLE THINGS.','Find your flow.',81);
        const sections=[
          ['Catch. Build. Submit.',`Tap falling letters in order. Tap your word to submit ${config.rules.minWordLength}+ letters. Each word can score once per round.`],
          ['Two clocks, one little moment.',`The round starts at ${fmt(config.timer.startSeconds)}s. Each pick resets a ${fmt(config.rules.nextLetterSeconds)}s letter bar. On expiry, valid words submit; unfinished words cost ${fmt(config.penalties.clearWordSeconds)}s.`],
          ['Think a little bigger.',`3 letters restore up to ${fmt(config.rewards.threeLetterMaxSeconds)}s; 4 up to ${fmt(config.rewards.fourLetterMaxSeconds)}s. Longer words earn more time. Gold adds time, with normal points.`],
          ['A blank is a possibility.',`? can be any letter. It resolves only on submission and scores zero. Nothing reveals validity before you submit.`],
          ['Quick words buy thinking time.',`${config.combo.wordsToStart} quick words unlock a longer letter window, up to ${fmt(config.rules.nextLetterSeconds+config.combo.maxExtraSeconds)}s. A miss, clear, repeat or ${fmt(config.combo.maxGapSeconds)}s gap resets the chain.`],
          ['One tile. Two sides.',`After ${fmt(config.specialTiles.warmupSeconds)}s, long words may drop a spinning pickup. Tap the hourglass face for ${fmt(config.hourglass.durationSeconds)}s of slow time; the bomb face releases ${fmt(config.smoke.durationSeconds)}s of smoke.`],
        ];
        sections.forEach(([heading,body],i)=>{const y=153+i*57;text(g,heading,36,y,{size:8.6});lines(g,body,36,y+17,{width:286,size:6.6,lineHeight:10.4});});
        lines(g,`Clear or repeat: -${fmt(config.penalties.clearWordSeconds)}s. Impossible prefix or unfinished submit: -${fmt(config.penalties.invalidWordSeconds)}s.\n${config.difficulty.enabled?`Spin builds for ${fmt(config.difficulty.rampSeconds)}s, then rises and falls.`:'Letters stay at easy Z spin.'} Missing a tile is free.`,180,503,{width:286,size:6.3,lineHeight:11,align:'center'});
        back('Got it');
      }else if(mode==='collection'){
        plinth(g,24,130,312,408,18);title('THIS ROUND, ONE WORD AT A TIME.','Your words.',151);
        const words=[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8);
        words.forEach((word,i)=>{const x=45+(i%2)*142,y=230+Math.floor(i/2)*43;panel(g,x,y,128,33,'cream',6);text(g,word,x+9,y+8,{size:10,maxWidth:88});text(g,game.collectedPoints(word),x+118,y+11,{size:7,align:'right',material:'muted'});});
        const previous=action('previous','<',45,420,44,32),next=action('next','>',271,420,44,32);previous.enabled=collectionPage>0;next.enabled=collectionPage<collectionPages-1;
        text(g,`${collectionPage+1} / ${collectionPages}`,180,431,{size:8,align:'center',material:'muted'});
        back('Back to the letters','menu',475);
      }else if(mode==='wordbook'){
        plinth(g,12,72,336,551,18);title(view.wordbookOnlyNew?'FIRST FOUND THIS ROUND.':'A LITTLE COLLECTION OF YOU.','Your Wordbook.',91);
        text(g,`${book.totalWords||0} different words discovered`,180,148,{size:8,align:'center',material:'muted'});
        action('book-query',view.wordbookQuery?`Search: ${view.wordbookQuery}`:'Search your words',25,171,310,34);
        const filters=['all','3','4','5','6','7','8+'];
        filters.forEach((filter,i)=>{const c=action(`book-filter:${filter}`,filter==='all'?'All':filter,25+i*45,217,40,29,{small:true});if(String(view.wordbookFilter||'all')===filter){panel(c.root,8,24,24,2,'ink',1,5,.4);}});
        [['recent','Newest'],['alpha','A to Z'],['played','Most played']].forEach(([sort,label],i)=>{const c=action(`book-sort:${sort}`,label,25+i*105,258,100,28,{small:true});if((view.wordbookSort||'recent')===sort)panel(c.root,36,23,28,2,'ink',1,5,.4);});
        const entries=filteredEntries(view);bookPages=Math.max(1,Math.ceil(entries.length/5));const page=Math.max(0,Math.min(Number(view.wordbookPage)||0,bookPages-1));
        entries.slice(page*5,page*5+5).forEach((entry,i)=>{const y=298+i*39;const row=action(`book-word:${entry.word}`,'',25,y,310,33);row.label=`${entry.word}, ${entry.length} letters, played ${entry.timesPlayed} ${entry.timesPlayed===1?'time':'times'}`;text(row.root,entry.word,12,8,{size:10.5,maxWidth:170});text(row.root,`${entry.length} letters  /  ${entry.timesPlayed} ${entry.timesPlayed===1?'play':'plays'}`,297,12,{size:6.4,align:'right',material:'muted',maxWidth:114});});
        if(!entries.length)lines(g,entryList(view).length?'No words match just yet.\nTry another length or search.':'Your first discovery starts here.\nPlay a round to collect your words.',180,365,{width:280,size:9,lineHeight:18,align:'center'});
        const previous=action('book-prev','<',25,508,44,32),next=action('book-next','>',291,508,44,32);previous.enabled=page>0;next.enabled=page<bookPages-1;
        text(g,`${entries.length} ${entries.length===1?'word':'words'}  /  ${page+1} of ${bookPages}`,180,519,{size:7.3,align:'center',material:'muted'});
        back(view.wordbookOnlyNew?'Back to results':'Back','menu',558);
        text(g,book.storageStatus?.state==='unavailable'?'Storage unavailable - words last for this visit':'Saved on this device',180,609,{size:5.8,align:'center',material:'muted'});
      }else if(mode==='word-detail'){
        plinth(g,18,88,324,531,18);title('EVERY WORD HAS A HISTORY.','A good find.',108);
        const word=typeof view.wordDetail==='string'?view.wordDetail:view.wordDetail?.word;
        const entry=entryList(view).find(item=>item.word===word)||view.wordDetail||{};
        text(g,entry.word||'',180,183,{size:31,align:'center',maxWidth:283,raised:true});
        text(g,`${entry.length||0} letters`,180,230,{size:9,align:'center',material:'muted'});
        const facts=[['First discovered',formatDate(entry.firstSeen)],['Last played',formatDate(entry.lastSeen)],['Times played',String(entry.timesPlayed||0)],['Best word score',`${entry.bestPoints||0} points`],['Without a wildcard',entry.withoutBlanks?'Played':'Not yet']];
        facts.forEach(([label,value],i)=>{const y=277+i*36;text(g,label,39,y,{size:8,material:'muted'});text(g,value,321,y,{size:8,align:'right',maxWidth:150});});
        lines(g,'A record of your discoveries.\nDefinitions are not part of this word-game dictionary.',180,482,{width:280,size:7,align:'center',lineHeight:15});
        back('Back to Wordbook','book-back');
      }else if(mode==='search'){
        plinth(g,12,90,336,531,18);title('A WORD YOU REMEMBER.','Search your Wordbook.',112);
        panel(g,25,183,310,49,'cream',10);text(g,view.wordbookQuery||'Type a word...',40,198,{size:18,maxWidth:280,material:view.wordbookQuery?'ink':'muted'});
        text(g,'Search matches any part of a collected word.',180,251,{size:7,align:'center',material:'muted'});
        const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
        rows.forEach((row,r)=>{const width=29,gap=3,total=row.length*(width+gap)-gap,left=(360-total)/2;[...row].forEach((letter,i)=>action(`key:${letter}`,letter,left+i*(width+gap),303+r*49,width,40,{small:true}));});
        action('key:backspace','Delete',25,462,148,36);action('book-clear-query','Clear search',187,462,148,36);
        back('Show matching words','key:done');
      }else if(mode==='goals'){
        plinth(g,18,71,324,550,18);title('A LITTLE DIRECTION, IF YOU LIKE.','Pick your curiosity.',92);
        text(g,'Optional goals. No deadlines. No score bonuses.',180,150,{size:7,align:'center',material:'muted'});
        const goals=book.goals||[];
        goals.slice(0,5).forEach((goal,i)=>{const y=184+i*62;const row=action(`goal:${goal.id}`,'',34,y,292,51);row.label=`${goal.title}, ${goal.current} of ${goal.target}${book.goal?.id===goal.id?', selected':''}`;text(row.root,goal.title,12,10,{size:9.2,maxWidth:235});text(row.root,`${goal.current} / ${goal.target}${goal.complete?'  complete':''}`,12,31,{size:6.8,material:'muted'});if(book.goal?.id===goal.id)text(row.root,'ON',277,20,{size:7,align:'right',material:'ink'});});
        action('goal:none','Just play',75,510,210,28,{quiet:true});
        back();
      }else if(mode==='stats'){
        plinth(g,18,71,324,550,18);title('YOUR OWN PATH, WORD BY WORD.','Your words, over time.',92);
        const recent=view.statsView==='recent';
        [['lifetime','All your words'],['recent','Recent play']].forEach(([id,label],i)=>{
          const tab=action(`stats-view:${id}`,label,34+i*150,155,142,30,{small:true});
          tab.label=`${label}${(id==='recent')===recent?', selected':''}`;
          if((id==='recent')===recent)panel(tab.root,56,25,30,2,'ink',1,5,.4);
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

        text(g,'COMMUNITY COMPARISON',180,476,{size:6.5,align:'center',spacing:.3,material:'muted'});
        lines(g,'Not enough real player data yet.\nYour personal progress is available now.',180,495,{size:7.6,lineHeight:15,align:'center'});
        back();
      }
    });
  }

  return {
    scene,
    resize(layout){
      currentLayout=layout;
      hud.position.y=status.position.y=rewardLayer.position.y=layout.height/2-layout.top;
      intro.position.y=playing.position.y=640-layout.height/2+layout.bottom;
      dim.scale.set(layout.width/360,layout.height/640,1);
    },
    obscures(x,y,margin=0){
      if(mode)return true;
      if(!currentLayout)return false;
      if(overlapsPanel(x,y,currentLayout,margin))return true;
      const localX=x-currentLayout.left,localY=y-currentLayout.top;
      return effectsVisible&&localX>74-margin&&localX<286+margin&&localY>120-margin&&localY<144+margin;
    },
    get blocking(){return Boolean(mode);},
    sync(game,view) {
      if(game.phase==='over'&&phase!=='over')clearScoreFlights();
      latestView=view;phase=game.phase;mode=view.mode;collectionPages=Math.max(1,Math.ceil(game.wordCount/8));collectionPage=Math.max(0,Math.min(view.collectionPage||0,collectionPages-1));
      intro.visible=phase==='ready';playing.visible=phase!=='ready';modal.visible=Boolean(mode);
      hud.visible=true;
      lastBest=view.best;syncMeters(game);
      rewardLayer.visible=phase==='running'&&!mode;
      pause.enabled=phase==='running';pause.root.visible=phase!=='ready';
      slot('homeBook',homeBook.root,view.book?.totalWords||0,g=>text(g,`Wordbook  /  ${view.book?.totalWords||0}`,73,13,{size:8,align:'center',maxWidth:132,z:6}));
      homeBook.label=`Wordbook, ${view.book?.totalWords||0} discovered words`;
      const goal=view.book?.goal;
      slot('homeGoal',homeGoal.root,JSON.stringify(goal||null),g=>text(g,goal?`${goal.title}  /  ${goal.current} of ${goal.target}`:'Pick a little goal  >',154,9,{size:7.4,align:'center',material:'muted',maxWidth:288,z:6}));
      slot('storageStatus',intro,view.book?.storageStatus?.state||'',g=>{if(view.book?.storageStatus?.state==='unavailable')text(g,'Storage unavailable - discoveries last for this visit',180,614,{size:5,align:'center',material:'danger',maxWidth:310});});
      homeGoal.label=goal?`Choose a goal. Current goal: ${goal.title}, ${goal.current} of ${goal.target}`:'Choose an optional goal';
      const signature=game.current+game.currentTiles.map(t=>t.blank?'?':t.bonus?'1':'0').join('')+phase+':'+game.letterWindow;
      letterTimer.visible=Boolean(game.current)&&phase!=='over';
      letterTimer.scale.x=Math.max(.001,game.letterSeconds/game.letterWindow);
      letterTimer.material=materials[game.effects.hourglass>0?'mint':'ink'];
      slot('word',playing,signature,g=>{
        text(g,game.current?`${fmt(game.letterWindow)}s / ADD LETTER OR AUTO-SUBMIT`:'PICK LETTERS IN ORDER',338,481,{size:5.8,align:'right',material:'muted',maxWidth:194});
        if(game.current)text(g,game.current,89,508,{size:24,maxWidth:205,raised:true,colors:game.currentTiles.map(t=>t.blank?'muted':t.bonus?'gold':'ink'),z:7});
        else text(g,'Catch a few letters...',89,516,{size:9,material:'muted',maxWidth:211,z:7});
      });
      const comboActive=game.comboBonusSeconds>0;
      slot('combo',playing,`${game.comboCount}:${game.nextLetterWindow}`,g=>{
        if(!game.comboCount)return;
        text(g,comboActive?`CHAIN ${game.comboCount} / ${fmt(game.nextLetterWindow)}s PER LETTER`:`CHAIN ${game.comboCount} / ${config.combo.wordsToStart}`,35,549,{size:5.5,material:comboActive?'ink':'muted',spacing:.2,maxWidth:230});
      });
      setEnabled(submit,phase==='running'&&Boolean(game.current));setEnabled(undo,phase==='running'&&Boolean(game.current));
      submit.label=game.current?`Submit ${game.current}`:'Submit current word';undo.label=`Clear whole word, ${fmt(config.penalties.clearWordSeconds)} second penalty`;
      collection.enabled=game.wordCount>0;
      slot('words',playing,`${game.wordCount}:${sessionNewWords.size}:${settleAge<discoverySeconds}`,g=>{
        latestRecentRoot=null;
        text(g,`${String(game.wordCount).padStart(2,'0')}${game.wordCount?'  >':''}`,338,560,{size:8,align:'right'});
        if(!game.wordCount)text(g,'A small collection of good ideas.',22,584,{size:7.5,material:'muted'});
        else [...game.words].reverse().slice(0,3).forEach((word,i)=>{
          const x=22+i*108,card=group(g,x,579);panel(card,0,0,100,22,'cream',5);
          const colors=word===resolvedWord&&settleAge<discoverySeconds?[...word].map((_,j)=>resolvedLetters.includes(j)?'gold':'ink'):undefined;
          text(card,word,7,6,{size:7.5,maxWidth:73,colors});text(card,game.collectedPoints(word),93,7,{size:6,align:'right',material:'muted'});
          if(sessionNewWords.has(word))text(g,'NEW',x+7,605,{size:4.8,material:'ink',spacing:.5});
          if(i===0)latestRecentRoot=card;
        });
      });
      const slow=Math.ceil(game.effects.hourglass),smoke=Math.ceil(game.effects.smoke);
      effectsVisible=phase==='running'&&Boolean(slow||smoke);status.visible=phase!=='ready';
      slot('effects',status,`${slow}:${smoke}`,g=>{
        if(slow){panel(g,slow&&smoke?74:132,120,96,23,'mint',11);text(g,`SLOW TIME / ${slow}s`,slow&&smoke?122:180,128,{size:6.7,align:'center'});}
        if(smoke){panel(g,slow?184:137,120,slow?102:86,23,'paper',11);text(g,`SMOKE / ${smoke}s`,slow?235:180,128,{size:6.7,align:'center'});}
      });
      slot('feedback',playing,`${view.feedback}:${view.feedbackKind}`,g=>{
        if(view.feedback)lines(g,view.feedback,180,434,{width:300,size:7.3,lineHeight:12,align:'center',material:view.feedbackKind==='bad'?'danger':'ink'});
      });
      if(mode)menu(game,view);
      focus=view.focus;hover=view.hover;
      for(const c of controls){
        const active=c.enabled&&(c.id===focus||c.id===hover);
        c.marker.visible=c.enabled&&c.id===focus;
        if(c.primary)c.body.material=materials[active?'primaryHover':'primary'];
        if(!c.primary&&!c.quiet)c.body.material=materials[c.enabled?(active?'cream':'paper'):'pale'];
        c.root.position.z=(c.root.parent===modal?27:1)+(active?1:0);
        c.root.position.y=-c.layoutY;
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
    selectionTarget(index,kind='letter'){return kind==='hourglass'?{x:(currentLayout?.left||0)+320,y:(currentLayout?.top||0)+87}:{x:(currentLayout?.left||0)+109+Math.min(index||0,7)*21,y:(currentLayout?.height||640)-(currentLayout?.bottom||0)-119};},
    press(action,now){lastPress=action;pressUntil=now+120;},
    celebrate,
    reset(){for(const item of celebrations)removeCelebration(item);celebrations.length=0;meters.reset();clearScoreFlights();recharge.visible=false;settleAge=Infinity;resolvedWord='';resolvedLetters=[];sessionNewWords.clear();},
    animate(now,dt,game){
      const activeDt=game.phase==='running'?dt:0;
      meters.advance(activeDt);settleAge+=activeDt;scoreSettleAge+=activeDt;
      const arrivals=scoreLedger.advance(activeDt);if(arrivals.length&&!reducedMotion)scoreSettleAge=0;
      for(let i=scoreFlights.length-1;i>=0;i--){
        const item=scoreFlights[i],end=item.reduced?.35:item.flight.duration;
        if(item.flight.age+1e-9>=end){removeCelebration(item);scoreLedger.retire(item.flight.id);scoreFlights.splice(i,1);}else animateScoreFlight(item);
      }
      scoreAnchor.scale.setScalar(reducedMotion?1:1+.055*Math.sin(Math.PI*clamp01(scoreSettleAge/.16)));
      if(latestRecentRoot)latestRecentRoot.position.y=-579+(reducedMotion?0:1.5*(1-easeOut(settleAge/successSeconds)));
      for(let i=celebrations.length-1;i>=0;i--){
        const item=celebrations[i];item.age+=activeDt;
        if(item.age>=config.celebration.durationSeconds){removeCelebration(item);celebrations.splice(i,1);}else animateCelebration(item);
      }
      syncMeters(game);
      for(const c of controls)if(c.id===lastPress&&now<pressUntil){c.root.position.z-=1.5;c.root.position.y-=1.5;}
    },
    description(game,view){
      if(mode==='paused')return 'Paused. A little breather. Your letters are right where you left them. The clock can wait.';
      if(mode==='over')return `Round complete. ${game.score} points from ${game.wordCount} ${game.wordCount===1?'word':'words'}. Best ${view.best}. ${(view.roundSummary?.newWords||[]).length} new ${(view.roundSummary?.newWords||[]).length===1?'word':'words'}: ${(view.roundSummary?.newWords||[]).join(', ')||'none this round'}.${view.roundSummary?.milestones?.[0]?` Milestone: ${view.roundSummary.milestones[0].title}.`:''}${view.book?.goal?` Goal: ${view.book.goal.title}, ${view.book.goal.current} of ${view.book.goal.target}${view.book.goal.complete?', complete':''}.`:''}`;
      if(mode==='settings')return `Settings. ${Object.entries(view.settings||{}).map(([key,value])=>`${key} ${value?'on':'off'}`).join('. ')}. Settings are saved on this device when local storage is available.`;
      if(mode==='wordbook')return `Wordbook. ${view.book?.totalWords||0} words discovered. Filter ${view.wordbookFilter||'all'}, sort ${view.wordbookSort||'recent'}. Search ${view.wordbookQuery||'empty'}. ${filteredEntries(view).length} matching words. Page ${(view.wordbookPage||0)+1} of ${bookPages}.`;
      if(mode==='word-detail'){const entry=entryList(view).find(entry=>entry.word===(typeof view.wordDetail==='string'?view.wordDetail:view.wordDetail?.word));return entry?`${entry.word}. ${entry.length} letters. First discovered ${formatDate(entry.firstSeen)}. Last played ${formatDate(entry.lastSeen)}. Played ${entry.timesPlayed} ${entry.timesPlayed===1?'time':'times'}. Best word score ${entry.bestPoints}. ${entry.withoutBlanks?'Played without a wildcard.':'Not yet played without a wildcard.'}`:'Word details.';}
      if(mode==='search')return `Search your Wordbook. Query: ${view.wordbookQuery||'empty'}. Use the letter buttons or your keyboard, then Show matching words.`;
      if(mode==='goals')return `Optional goals. ${view.book?.goal?`${view.book.goal.title}: ${view.book.goal.current} of ${view.book.goal.target}.`:'No goal selected.'} No deadlines or score bonuses.`;
      if(mode==='stats'){const personal=view.book?.stats?.personal||{};return view.statsView==='recent'?`Recent play. ${Math.floor(personal.observedSeconds||0)} seconds observed in your latest 20 minutes of active play. Distinct words played without wildcards: ${[5,6,7].map(length=>`${length} letters: ${personal.distinctByLength?.[length]||0}`).join(', ')}. Each word counts once in this window. ${personal.complete?'Full window.':'The window is still filling.'} Community comparison unavailable: not enough real player data yet.`:`Personal progress. ${view.book?.totalWords||0} different words discovered. ${view.book?.stats?.roundsPlayed||0} ${(view.book?.stats?.roundsPlayed||0)===1?'round':'rounds'} played. Best score ${view.book?.stats?.bestScore||view.best||0}. Community comparison unavailable: not enough real player data yet.`;}
      if(mode==='help')return `How to play. Tap letters in order and submit words of ${config.rules.minWordLength} or more letters. The letter countdown starts at ${fmt(config.rules.nextLetterSeconds)} seconds. On expiry, a valid unused word submits automatically; an unfinished word is discarded for a ${fmt(config.penalties.clearWordSeconds)} second penalty. Repeats still cost time. ${config.combo.enabled?`${config.combo.wordsToStart} consecutive words less than ${fmt(config.combo.maxGapSeconds)} active seconds apart unlock a combo, adding ${fmt(config.combo.extraSecondsPerWord)} seconds per further word, capped at ${fmt(config.rules.nextLetterSeconds+config.combo.maxExtraSeconds)} seconds per letter. Any failed or discarded word, or a gap of ${fmt(config.combo.maxGapSeconds)} seconds without a word, resets the combo.`:''} Pausing freezes both timers. The hourglass slows the letter countdown along with the round clock; combo expiry still uses active real time. Blank tiles show as ? and automatically resolve to an unused valid word on submission; blanks score zero. Three-letter base reward up to ${fmt(config.rewards.threeLetterMaxSeconds)} seconds; four-letter up to ${fmt(config.rewards.fourLetterMaxSeconds)} seconds; longer words earn more time. Gold adds extra time, with normal points. Earned time can reach ${fmt(config.timer.maxSeconds)} seconds. Special tiles unlock after ${fmt(config.specialTiles.warmupSeconds)} active seconds. Some five-letter or longer words drop a two-sided pickup rotating around Y. Tap its visible hourglass face for ${fmt(config.hourglass.durationSeconds)} seconds of slow time, or its smoke bomb face for ${fmt(config.smoke.durationSeconds)} seconds of smoke. An edge-on tap does not consume it. Letter tiles never release smoke. ${config.difficulty.enabled?`Letter Z spin starts at zero, ramps up over ${fmt(config.difficulty.rampSeconds)} active seconds, then smoothly rises and falls randomly within its speed limits. Pausing freezes the difficulty curve; restarting begins easy.`:'Letter Z spin stays at zero.'} Clear minus ${fmt(config.penalties.clearWordSeconds)} seconds, repeat minus ${fmt(config.penalties.repeatWordSeconds)}, spelling minus ${fmt(config.penalties.invalidWordSeconds)}.`;
      if(mode==='collection')return `Collected words, page ${collectionPage+1} of ${collectionPages}: ${[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8).join(', ')}.`;
      const latest=celebrations.at(-1),reward=latest?` ${latest.result.word}: +${latest.result.points} points. ${latest.result.reward>0?`+${fmt(latest.result.reward)} seconds.`:'Maximum time.'}`:'';
      return `${phase==='ready'?'CLTTR. A little word wonder. Catch letters. Find words. Keep the moment going.':`Time ${Math.ceil(game.remaining)} seconds.${game.remaining>config.timer.startSeconds?` Overtime ${Math.ceil(game.remaining/config.timer.startSeconds*100)} percent.`:''} Points ${game.score}. Current word: ${game.current||'empty'}.${game.current?` Next letter or automatic submission in ${game.secondsUntilWordTimeout.toFixed(1)} seconds. Letter window ${fmt(game.letterWindow)} seconds.`:''}${game.comboCount?` ${game.comboBonusSeconds>0?'Combo':'Chain'} ${game.comboCount}. Next-letter window ${fmt(game.nextLetterWindow)} seconds. Chain expires in ${Math.ceil(game.comboSeconds)} seconds.`:''} Words collected ${game.wordCount}: ${game.words.join(', ')||'none'}.${reward} ${view.feedback}`}`;
    },
  };
}
