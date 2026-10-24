import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { celMaterial } from './materials.js';
import { DESIGN } from './design.js';
import { createIcon } from './icons.js';
import { RewardMeters, clamp01, easeOut } from './reward-motion.mjs';
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
  let phase = 'ready', mode = '', focus = '', hover = '', lastPress = '', pressUntil = 0;
  let collectionPage = 0, collectionPages = 1;
  const meters=new RewardMeters(config.celebration),celebrations=[];
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
    if(old)old.group.removeFromParent();
    const g=new THREE.Group();parent.add(g);build(g);slots.set(key,{signature,group:g});return g;
  }
  function icon(parent,kind,x,y,{scale=1,material='ink',z=6}={}) {
    const g=createIcon(kind,materials[material],['hourglass','grenade'].includes(kind)?materials.gold:materials[material]);
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
  function ancestorsVisible(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
  function enabledControls(){
    const order=['start','help','pause','submit','undo','collection','sound','previous','next','menu','restart'];
    return controls.filter(c=>c.enabled&&ancestorsVisible(c.root)&&(mode?modal===c.root.parent:!modal.children.includes(c.root)))
      .sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
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
  text(intro,'MAKE SOMETHING OF THE FALL.',180,334,{size:6.5,align:'center',spacing:.45});
  text(intro,'A little word wonder.',180,356,{size:24,align:'center',maxWidth:316,raised:true});
  lines(intro,'Catch letters. Find words.\nKeep the moment going.',180,392,{size:9,align:'center',lineHeight:15});
  button(intro,'start',"Let's play",26,437,308,47,{primary:true});
  text(intro,`${fmt(config.timer.startSeconds)} seconds / ${config.rules.minWordLength}+ letters / no repeats`,180,497,{size:6.6,align:'center',material:'muted'});
  button(intro,'help','How to play',26,520,146,34);
  const sound=button(intro,'sound','',188,520,146,34);
  icon(intro,'hourglass',82,575,{material:'muted',scale:.65});text(intro,'SLOW',82,592,{size:5.5,align:'center',material:'muted',spacing:.5});
  text(intro,`x${config.bonusLetters.timeMultiplier}`,180,568,{size:13,align:'center',material:'muted',raised:true});text(intro,'MORE TIME',180,592,{size:5.5,align:'center',material:'muted',spacing:.5});
  icon(intro,'grenade',278,575,{material:'muted',scale:.75});text(intro,'SMOKE',278,592,{size:5.5,align:'center',material:'muted',spacing:.5});

  plinth(playing,12,470,336,151,15);
  text(playing,'YOUR WORD',22,480,{size:6.7,spacing:.5});
  const submit=button(playing,'submit','',22,498,262,46);
  icon(submit.root,'arrow',239,24,{material:'muted',scale:.8,z:5});
  const undo=button(playing,'undo','',292,498,46,46);
  icon(undo.root,'undo',23,16,{scale:.8,z:5});text(undo.root,`-${fmt(config.penalties.clearWordSeconds)}s`,23,32,{size:6.4,align:'center',material:'muted',z:5});
  const letterTimer=panel(submit.root,13,41,230,2,'ink',1,7,.25);
  letterTimer.visible=false;
  text(playing,'WORDS COLLECTED',22,561,{size:6.7,spacing:.5});
  const collection=button(playing,'collection','',20,553,320,49,{quiet:true});collection.label='View collected words';

  // Small mesh labels stay inside the header, beside the values they update.
  // The falling field and word tray remain unobstructed during rewards.
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
  function celebrate(result,game){
    meters.add(result.reward,result.points);
    // Replace an earlier label instead of piling several rewards over the HUD.
    for(const item of celebrations)removeCelebration(item);celebrations.length=0;
    const root=group(rewardLayer),points=group(root,244,66,12),time=group(root,298,66,12);
    text(points,`+${result.points}`,0,0,{size:9,align:'right',material:'muted',maxWidth:42});
    text(time,result.reward>0?`+${fmt(result.reward)}s`:'MAX',0,0,{size:9,align:'right',material:'muted',maxWidth:42});
    const pointMaterials=fadeMaterials(points),timeMaterials=fadeMaterials(time);
    const ownedMaterials=[...pointMaterials,...timeMaterials];
    const item={root,points,time,materials:ownedMaterials,pointMaterials,timeMaterials,age:0,result,startTime:meters.values(game.remaining,game.score).time};
    celebrations.push(item);
    animateCelebration(item);
  }
  function animateCelebration(item){
    const {age,points,time}=item,duration=config.celebration.durationSeconds,t=clamp01(age/duration);
    const alpha=clamp01(t/.12)*(1-clamp01((t-.55)/.45));
    const rise=reducedMotion?0:2*easeOut(t);
    points.position.y=time.position.y=-(66-rise);
    setAlpha(item.pointMaterials,alpha);setAlpha(item.timeMaterials,alpha);
  }
  function syncMeters(game){
    const shown=meters.values(game.remaining,game.score),timeRatio=shown.time/config.timer.startSeconds;
    const extraCapacity=config.timer.maxSeconds-config.timer.startSeconds,inOvertime=shown.time>config.timer.startSeconds;
    timer.scale.x=Math.max(.001,Math.min(1,timeRatio));
    timer.material=materials[game.effects.hourglass>0?'mint':game.remaining<=config.timer.lowTimeSeconds?'danger':'ink'];
    overtime.visible=inOvertime&&extraCapacity>0;
    overtime.scale.x=Math.max(.001,Math.min(1,(shown.time-config.timer.startSeconds)/Math.max(.001,extraCapacity)));
    const timeLabel=inOvertime?`OVERTIME / ${Math.ceil(timeRatio*100)}%`:'TIME';
    slot('timeLabel',hud,timeLabel,g=>text(g,timeLabel,24,67,{size:6.2,material:'muted',spacing:.6}));
    slot('clock',clockAnchor,Math.ceil(shown.time),g=>text(g,`${Math.ceil(shown.time)}s`,0,0,{size:10,align:'right',raised:true}));
    slot('score',scoreAnchor,shown.score,g=>text(g,String(shown.score).padStart(2,'0'),0,0,{size:17,align:'right'}));
    slot('best',hud,lastBest,g=>text(g,String(lastBest).padStart(2,'0'),291,39,{size:17,align:'right'}));
    const latest=celebrations.at(-1),age=latest?.age??Infinity;
    recharge.visible=Boolean(latest&&latest.result.reward>0&&age<1.15);
    if(recharge.visible){
      const base=inOvertime?config.timer.startSeconds:0,range=inOvertime?extraCapacity:config.timer.startSeconds;
      const from=clamp01((latest.startTime-base)/range),to=clamp01((shown.time-base)/range);
      recharge.position.x=25+from*310;recharge.scale.x=Math.max(.001,to-from);
      recharge.material.uniforms.opacity.value=.28*(1-clamp01((age-.4)/.75));
    }
  }

  // Menu panels are in the same WebGL scene, with their own mesh backdrop.
  const dim=new THREE.Mesh(new THREE.PlaneGeometry(360,640),new THREE.MeshBasicMaterial({color:'#604d6d',transparent:true,opacity:.82,depthWrite:false}));
  dim.position.set(180,-320,20);modal.add(dim);
  const menuContent=group(modal,0,0,23);
  const menuPrimary=button(modal,'menu','',49,391,262,44,{primary:true});menuPrimary.root.position.z=27;
  const restart=button(modal,'restart','Start a fresh round',80,449,200,28,{quiet:true});restart.root.position.z=27;
  const previous=button(modal,'previous','<',52,426,44,32);previous.root.position.z=27;
  const next=button(modal,'next','>',264,426,44,32);next.root.position.z=27;

  function menu(game,view) {
    const key=[mode,game.score,game.wordCount,view.roundBest,collectionPage].join(':');
    slot('menu',menuContent,key,g=>{
      restart.root.visible=mode==='paused';previous.root.visible=next.root.visible=mode==='collection';
      const help=mode==='help', collecting=mode==='collection';
      plinth(g,24,help?97:collecting?130:mode==='over'?161:192,312,help?487:collecting?390:mode==='over'?308:278,18);
      if(mode==='paused') {
        text(g,'TAKE YOUR TIME.',180,215,{size:7,align:'center',spacing:.6});
        text(g,'A little breather.',180,239,{size:24,align:'center',maxWidth:272,raised:true});
        lines(g,'Your letters are right where you left them.\nThe clock can wait.',180,291,{size:8.5,align:'center',lineHeight:16});
      }else if(mode==='over'){
        text(g,game.score>view.roundBest?'A NEW PERSONAL BEST.':'A MOMENT WELL SPENT.',180,184,{size:7,align:'center',spacing:.4});
        text(g,'Time to exhale.',180,209,{size:24,align:'center',maxWidth:272,raised:true});
        text(g,game.score,180,251,{size:65,align:'center',maxWidth:260,raised:true});
        text(g,`points from ${game.wordCount} ${game.wordCount===1?'word':'words'}`,180,334,{size:9,align:'center'});
        const longest=game.words.reduce((a,b)=>b.length>a.length?b:a,'');
        if(longest)text(g,`Longest: ${longest}`,180,355,{size:8,align:'center',maxWidth:260,material:'muted'});
      }else if(help){
        text(g,'A FEW LITTLE THINGS.',180,119,{size:6.5,align:'center',spacing:.6});
        text(g,'Find your flow.',180,143,{size:25,align:'center',raised:true});
        lines(g,`Tap letters in order. Tap your word to submit.\n${config.rules.minWordLength}+ letters. No repeated words.`,180,187,{size:8,align:'center',lineHeight:14});
        text(g,`After ${fmt(config.rules.nextLetterSeconds)}s: valid words auto-submit.`,180,216,{size:7,align:'center',material:'muted'});
        text(g,'Blank = any letter. Zero points.',180,228,{size:6.5,align:'center',material:'muted'});
        const rows=[
          ['arrow','Think a little bigger.',`3 letters: up to ${fmt(config.rewards.threeLetterMaxSeconds)}s. 4 letters: up to ${fmt(config.rewards.fourLetterMaxSeconds)}s.\n5+ letters buy you real time.`],
          ['gold','Gold adds extra time.','Even on short words. Points stay the same.'],
          ['hourglass','Catch a slower moment.',`After ${fmt(config.specialTiles.warmupSeconds)}s, some ${config.hourglass.minWordLength}+ letter words\ncan drop ${fmt(config.hourglass.durationSeconds)} seconds of slow time.`],
          ['grenade','Watch the grenade.',`After ${fmt(config.specialTiles.warmupSeconds)}s, marked letters release\n${fmt(config.smoke.durationSeconds)} seconds of smoke when used.`],
        ];
        rows.forEach(([kind,title,body],i)=>{const y=240+i*52;if(kind==='gold')text(g,`x${config.bonusLetters.timeMultiplier}`,52,y,{size:13,align:'center',material:'muted'});else icon(g,kind,52,y+8,{scale:.8,material:'muted'});text(g,title,74,y,{size:8.4});lines(g,body,74,y+17,{width:220,size:7,lineHeight:12});});
        if(config.combo.enabled)lines(g,`${config.combo.wordsToStart} quick words unlock more thinking time.\nUp to ${fmt(config.rules.nextLetterSeconds+config.combo.maxExtraSeconds)}s per letter. A miss or ${fmt(config.combo.maxGapSeconds)}s gap resets it.`,180,492,{size:6.6,lineHeight:12,align:'center'});
        lines(g,`Clear / invalid timeout: -${fmt(config.penalties.clearWordSeconds)}s. Repeat: -${fmt(config.penalties.repeatWordSeconds)}s.\nMisspell or submit unfinished: -${fmt(config.penalties.invalidWordSeconds)}s.`,180,462,{size:7.3,lineHeight:13,align:'center'});
      }else if(collecting){
        text(g,'A COLLECTION OF GOOD IDEAS.',180,151,{size:6,align:'center',spacing:.4});
        text(g,'Your words.',180,174,{size:25,align:'center',raised:true});
        const words=[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8);
        words.forEach((word,i)=>{const x=45+(i%2)*142,y=230+Math.floor(i/2)*43;panel(g,x,y,128,33,'cream',6);text(g,word,x+9,y+8,{size:10,maxWidth:88});text(g,game.collectedPoints(word),x+118,y+11,{size:7,align:'right',material:'muted'});});
        text(g,`${collectionPage+1} / ${collectionPages}`,180,437,{size:8,align:'center',material:'muted'});
      }
      const label=help?'Got it':collecting?'Back to the letters':mode==='over'?'Play again':'Keep going';
      menuPrimary.label=label;menuPrimary.layoutY=help?531:collecting?472:391;menuPrimary.root.position.y=-menuPrimary.layoutY;
      slot('menuButton',menuPrimary.root,label,g=>text(g,label,17,15,{size:11.5,material:'lightText',maxWidth:207,z:5}));
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
      phase=game.phase;mode=view.mode;collectionPages=Math.max(1,Math.ceil(game.wordCount/8));collectionPage=Math.min(view.collectionPage,collectionPages-1);
      intro.visible=phase==='ready';playing.visible=phase!=='ready';modal.visible=Boolean(mode);
      hud.visible=true;
      lastBest=view.best;syncMeters(game);
      rewardLayer.visible=phase==='running'&&!mode;
      pause.enabled=phase==='running';pause.root.visible=phase!=='ready';
      slot('sound',sound.root,view.soundOn,g=>{icon(g,view.soundOn?'sound':'silent',19,17,{scale:.65,material:'ink',z:6});text(g,view.soundOn?'Sound on':'Sound off',40,12,{size:8,material:'ink',z:6});});
      sound.label=`Turn sound ${view.soundOn?'off':'on'}`;
      const signature=game.current+game.currentTiles.map(t=>t.blank?'?':t.bonus?'1':'0').join('')+phase+':'+game.letterWindow;
      letterTimer.visible=Boolean(game.current)&&phase!=='over';
      letterTimer.scale.x=Math.max(.001,game.letterSeconds/game.letterWindow);
      slot('word',playing,signature,g=>{
        text(g,game.current?`${fmt(game.letterWindow)}s / ADD LETTER OR AUTO-SUBMIT`:'PICK LETTERS IN ORDER',338,481,{size:5.8,align:'right',material:'muted',maxWidth:194});
        if(game.current)text(g,game.current,35,508,{size:24,maxWidth:205,raised:true,colors:game.currentTiles.map(t=>t.blank?'muted':t.bonus?'gold':'ink'),z:7});
        else text(g,'Catch a few letters...',35,516,{size:9,material:'muted',maxWidth:211,z:7});
      });
      const comboActive=game.comboBonusSeconds>0;
      slot('combo',playing,`${game.comboCount}:${game.nextLetterWindow}`,g=>{
        if(!game.comboCount)return;
        text(g,comboActive?`COMBO ${game.comboCount} / ${fmt(game.nextLetterWindow)}s PER LETTER`:`CHAIN ${game.comboCount} / ${config.combo.wordsToStart}`,35,549,{size:5.5,material:comboActive?'ink':'muted',spacing:.2,maxWidth:230});
      });
      setEnabled(submit,phase==='running'&&Boolean(game.current));setEnabled(undo,phase==='running'&&Boolean(game.current));
      submit.label=game.current?`Submit ${game.current}`:'Submit current word';undo.label=`Clear whole word, ${fmt(config.penalties.clearWordSeconds)} second penalty`;
      collection.enabled=game.wordCount>0;
      slot('words',playing,game.wordCount,g=>{
        text(g,`${String(game.wordCount).padStart(2,'0')}${game.wordCount?'  >':''}`,338,560,{size:8,align:'right'});
        if(!game.wordCount)text(g,'A small collection of good ideas.',22,584,{size:7.5,material:'muted'});
        else [...game.words].reverse().slice(0,3).forEach((word,i)=>{const x=22+i*108;panel(g,x,579,100,22,'cream',5);text(g,word,x+7,585,{size:7.5,maxWidth:73});text(g,game.collectedPoints(word),x+93,586,{size:6,align:'right',material:'muted'});});
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
      previous.enabled=collectionPage>0;next.enabled=collectionPage<collectionPages-1;
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
    press(action,now){lastPress=action;pressUntil=now+120;},
    celebrate,
    reset(){for(const item of celebrations)removeCelebration(item);celebrations.length=0;meters.reset();recharge.visible=false;},
    animate(now,dt,game){
      const activeDt=game.phase==='running'?dt:0;
      meters.advance(activeDt);
      for(let i=celebrations.length-1;i>=0;i--){
        const item=celebrations[i];item.age+=activeDt;
        if(item.age>=config.celebration.durationSeconds){removeCelebration(item);celebrations.splice(i,1);}else animateCelebration(item);
      }
      syncMeters(game);
      for(const c of controls)if(c.id===lastPress&&now<pressUntil){c.root.position.z-=1.5;c.root.position.y-=1.5;}
    },
    description(game,view){
      if(mode==='paused')return 'Paused. A little breather. Your letters are right where you left them. The clock can wait.';
      if(mode==='over')return `Time to exhale. ${game.score} points from ${game.wordCount} words. Best ${view.best}.`;
      if(mode==='help')return `How to play. Tap letters in order and submit words of ${config.rules.minWordLength} or more letters. The letter countdown starts at ${fmt(config.rules.nextLetterSeconds)} seconds. On expiry, a valid unused word submits automatically; an unfinished word is discarded for a ${fmt(config.penalties.clearWordSeconds)} second penalty. Repeats still cost time. ${config.combo.enabled?`${config.combo.wordsToStart} consecutive words less than ${fmt(config.combo.maxGapSeconds)} active seconds apart unlock a combo, adding ${fmt(config.combo.extraSecondsPerWord)} seconds per further word, capped at ${fmt(config.rules.nextLetterSeconds+config.combo.maxExtraSeconds)} seconds per letter. Any failed or discarded word, or a gap of ${fmt(config.combo.maxGapSeconds)} seconds without a word, resets the combo.`:''} Pausing freezes both timers. Blank tiles show as ? and automatically resolve to an unused valid word on submission; blanks score zero. Three-letter base reward up to ${fmt(config.rewards.threeLetterMaxSeconds)} seconds; four-letter up to ${fmt(config.rewards.fourLetterMaxSeconds)} seconds; longer words earn more time. Gold adds extra time, with normal points. Earned time can reach ${fmt(config.timer.maxSeconds)} seconds. Special tiles unlock after ${fmt(config.specialTiles.warmupSeconds)} active seconds. Some five-letter or longer words drop an hourglass for ${fmt(config.hourglass.durationSeconds)} seconds of slow time. Grenade letters release ${fmt(config.smoke.durationSeconds)} seconds of smoke. Clear minus ${fmt(config.penalties.clearWordSeconds)} seconds, repeat minus ${fmt(config.penalties.repeatWordSeconds)}, spelling minus ${fmt(config.penalties.invalidWordSeconds)}.`;
      if(mode==='collection')return `Collected words, page ${collectionPage+1} of ${collectionPages}: ${[...game.words].reverse().slice(collectionPage*8,collectionPage*8+8).join(', ')}.`;
      const latest=celebrations.at(-1),reward=latest?` ${latest.result.word}: +${latest.result.points} points. ${latest.result.reward>0?`+${fmt(latest.result.reward)} seconds.`:'Maximum time.'}`:'';
      return `${phase==='ready'?'CLTTR. A little word wonder. Catch letters. Find words. Keep the moment going.':`Time ${Math.ceil(game.remaining)} seconds.${game.remaining>config.timer.startSeconds?` Overtime ${Math.ceil(game.remaining/config.timer.startSeconds*100)} percent.`:''} Points ${game.score}. Current word: ${game.current||'empty'}.${game.current?` Next letter or automatic submission in ${game.letterSeconds.toFixed(1)} seconds. Letter window ${fmt(game.letterWindow)} seconds.`:''}${game.comboCount?` ${game.comboBonusSeconds>0?'Combo':'Chain'} ${game.comboCount}. Next-letter window ${fmt(game.nextLetterWindow)} seconds. Chain expires in ${Math.ceil(game.comboSeconds)} seconds.`:''} Words collected ${game.wordCount}: ${game.words.join(', ')||'none'}.${reward} ${view.feedback}`}`;
    },
  };
}
