import * as THREE from 'three';
import { DESIGN } from './design.js';

// Two-tone diffuse light, with an optional small satin highlight on tile bodies.
// World-space normals keep the light stationary as each tile rotates.
export function celMaterial(tones,{specularStrength=0,shininess=56}={}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      lightTone: { value: new THREE.Color(tones[0]) },
      shadeTone: { value: new THREE.Color(tones[1]) },
      lightDirection: { value: new THREE.Vector3(...DESIGN.cel.light).normalize() },
      threshold: { value: DESIGN.cel.threshold },
      specularStrength: { value: specularStrength }, shininess: { value: shininess },
      opacity: { value: 1 },
    },
    vertexShader: `varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 lightTone, shadeTone, lightDirection;
      uniform float threshold,specularStrength,shininess,opacity;
      varying vec3 vNormal;
      void main() {
        vec3 normal=normalize(vNormal);
        float illumination=dot(normal,lightDirection);
        float band = step(threshold,illumination);
        // The orthographic camera looks straight down Z everywhere on the field.
        vec3 viewDirection=vec3(0.,0.,1.);
        vec3 halfVector=normalize(lightDirection+viewDirection);
        float highlight=pow(max(0.,dot(normal,halfVector)),shininess)*specularStrength*step(0.,illumination);
        gl_FragColor = vec4(mix(mix(shadeTone,lightTone,band),vec3(1.,.96,.85),highlight),opacity);
        #include <colorspace_fragment>
      }`,
  });
}

// The warning breath changes only surface light: tile size, ink and collision
// geometry stay steady. Each gas tile owns its pulse uniform independently.
export function gasTileMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{
      lightTone:{value:new THREE.Color(DESIGN.palette.smokeTile[0])},
      shadeTone:{value:new THREE.Color(DESIGN.palette.smokeTile[1])},
      lightDirection:{value:new THREE.Vector3(...DESIGN.cel.light).normalize()},
      threshold:{value:DESIGN.cel.threshold},pulse:{value:0},opacity:{value:1},
    },
    vertexShader:`varying vec3 vNormal,vObjectNormal;
      void main(){vNormal=normalize(mat3(modelMatrix)*normal);vObjectNormal=normal;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vNormal,vObjectNormal;uniform vec3 lightTone,shadeTone,lightDirection;
      uniform float threshold,pulse,opacity;
      void main(){
        float band=step(threshold,dot(normalize(vNormal),lightDirection));
        float bevel=smoothstep(.02,.6,1.-abs(normalize(vObjectNormal).z));
        vec3 col=mix(shadeTone,lightTone,band);
        col=mix(col,lightTone*1.35,pulse*(.28+.32*bevel));
        gl_FragColor=vec4(col,opacity);
        #include <colorspace_fragment>
      }`,
  });
}

export function gasAuraMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    uniforms:{tint:{value:new THREE.Color(DESIGN.palette.smoke)},opacity:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform vec3 tint;uniform float opacity;
      void main(){
        vec2 q=abs((vUv-.5)*2.)-vec2(.62);
        float edge=length(max(q,0.))+min(max(q.x,q.y),0.)-.18;
        float glow=exp(-max(0.,edge)*10.)*smoothstep(-.09,.04,edge);
        gl_FragColor=vec4(tint,glow*opacity);
        #include <colorspace_fragment>
      }`,
  });
}

// Faux glass and metal share the existing rounded geometry: no texture fetches,
// refraction pass or alpha sorting. Object-space gradients work on both faces;
// normals give the bevel its own bright rim as a tile turns.
export function specialTileMaterial(kind,size=52) {
  if(!['ice','fire','gold'].includes(kind))throw new Error(`Unknown special material: ${kind}`);
  const p=DESIGN.palette,isIce=kind==='ice',isFire=kind==='fire';
  return new THREE.ShaderMaterial({
    uniforms:{
      lightTone:{value:new THREE.Color(isIce?p.ice[0]:isFire?p.fire[0]:p.goldHighlight[0])},
      midTone:{value:new THREE.Color(isIce?p.ice[1]:isFire?p.fire[1]:p.goldSurface[0])},
      shadeTone:{value:new THREE.Color(isIce?p.iceDeep:isFire?p.fireDeep:p.goldSurface[1])},
      lightDirection:{value:new THREE.Vector3(...DESIGN.cel.light).normalize()},
      // Fire uses the same glasslike facets and bright bevel as ice, with a
      // saturated red/orange/yellow palette instead of a white highlight.
      halfSize:{value:size/2},ice:{value:isIce||isFire?1:0},fire:{value:isFire?1:0},time:{value:0},opacity:{value:1},
    },
    vertexShader:`varying vec3 vNormal,vObjectNormal;varying vec2 vSurface;uniform float halfSize;
      void main(){
        vNormal=normalize(mat3(modelMatrix)*normal);vObjectNormal=normal;
        vSurface=position.xy/(halfSize*2.)+.5;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`varying vec3 vNormal,vObjectNormal;varying vec2 vSurface;
      uniform vec3 lightTone,midTone,shadeTone,lightDirection;uniform float ice,fire,time,opacity;
      void main(){
        vec3 normal=normalize(vNormal);
        float light=clamp(dot(normal,lightDirection)*.5+.5,0.,1.);
        float diagonal=vSurface.x*.46+vSurface.y*.78;
        float gradient=smoothstep(.02,1.08,diagonal);
        vec3 col=mix(shadeTone,midTone,smoothstep(.0,mix(.48,.20,ice),gradient));
        col=mix(col,lightTone,smoothstep(.34,1.,gradient)*mix(.58,.90,ice));
        // Fire needs a broad red base to stay distinct from gold. Its slower
        // vertical transition retains red below, orange centrally, and yellow
        // above, while ice and gold retain their original diagonal gradients.
        float heat=clamp(vSurface.y+(vSurface.x-.5)*.12,0.,1.);
        vec3 fireColor=mix(shadeTone,midTone,smoothstep(.23,.57,heat));
        fireColor=mix(fireColor,lightTone,smoothstep(.57,.88,heat));
        col=mix(col,fireColor,fire);
        // Wide reflected stripe with a narrow hot center, kept within each
        // material's palette. Motion is very slow and disabled in reduced motion.
        float center=.58+sin(time*.48)*.10+normal.x*.10;
        float stripe=1.-smoothstep(.025,.13,abs(diagonal-center));
        float hot=1.-smoothstep(.009,.034,abs(diagonal-center+.015));
        col=mix(col,lightTone,stripe*mix(mix(.74,.40,ice),.22,fire));
        col=mix(col,lightTone,hot*mix(mix(.80,.44,ice),.32,fire));
        // Shallow interior facets suggest trapped light in the ice.
        float facet=(1.-smoothstep(.008,.024,abs(vSurface.x*.64-vSurface.y+.19)))*.12*ice;
        col=mix(col,lightTone,facet);
        float bevel=smoothstep(.02,.60,1.-abs(normalize(vObjectNormal).z));
        col=mix(col,lightTone,bevel*mix(mix(.51,.86,ice),.66,fire));
        col*=.91+.09*light;
        gl_FragColor=vec4(col,opacity);
        #include <colorspace_fragment>
      }`,
  });
}

export const THERMAL_WAVE={start:-.17,end:1.17,feather:.12,ripple:.025,frequency:5.7};
const ICE_WAVE=THERMAL_WAVE;
const smooth=(a,b,value)=>{const t=Math.min(1,Math.max(0,(value-a)/(b-a)));return t*t*(3-2*t);};

// The compositor and snow use the same wave shape, in bottom-up field UVs.
export function iceWaveCoverage(progress,x,y){
  const eased=smooth(0,1,progress);
  const front=ICE_WAVE.start+(ICE_WAVE.end-ICE_WAVE.start)*eased+Math.sin(x*ICE_WAVE.frequency)*ICE_WAVE.ripple;
  return 1-smooth(front-ICE_WAVE.feather,front+ICE_WAVE.feather,y);
}

export function fireWaveCoverage(progress,x,y){return iceWaveCoverage(progress,x,1-y);}

function thermalTintMaterial(fire=false){
  return new THREE.ShaderMaterial({
    depthWrite:false,depthTest:false,
    uniforms:{
      source:{value:null},tint:{value:new THREE.Color(fire?DESIGN.palette.fireTint:DESIGN.palette.iceTint)},
      dark:{value:new THREE.Color(fire?DESIGN.palette.fireInk[0]:DESIGN.palette.iceInk[0])},
      light:{value:new THREE.Color(fire?DESIGN.palette.fireGlow:DESIGN.palette.ice[0])},
      opacity:{value:0},progress:{value:0},strength:{value:fire?.91:.92},reverse:{value:fire?1:0},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D source;
      uniform vec3 tint,dark,light;uniform float opacity,progress,strength,reverse;
      void main(){
        // The source is linear light. Preserve the letters' contrast while
        // mapping the field into the active cold or warm palette.
        vec3 original=texture2D(source,vUv).rgb;
        float luminance=dot(original,vec3(.2126,.7152,.0722));
        vec3 frozen=mix(dark,tint,smoothstep(.015,.62,luminance));
        frozen=mix(frozen,light,smoothstep(.58,.98,luminance));
        float eased=progress*progress*(3.-2.*progress);
        float front=mix(${ICE_WAVE.start},${ICE_WAVE.end},eased)+sin(vUv.x*${ICE_WAVE.frequency})*${ICE_WAVE.ripple};
        float waveY=mix(vUv.y,1.-vUv.y,reverse);
        float wave=1.-smoothstep(front-${ICE_WAVE.feather},front+${ICE_WAVE.feather},waveY);
        float fade=opacity*opacity*(3.-2.*opacity);
        gl_FragColor=vec4(mix(original,frozen,wave*fade*strength),1.);
        #include <colorspace_fragment>
      }`,
  });
}
export function iceTintMaterial(){return thermalTintMaterial();}
export function fireTintMaterial(){return thermalTintMaterial(true);}

// Seconds here are real active seconds, independent of the slowed game clock.
// Continuing active frames preserve the rising wave; blocked pickups never restart it.
export function stepThermalWave(state,{active,paused=false,reducedMotion=false,interrupted=false,delta=0}){
  if(interrupted){state.opacity=0;state.progress=0;return state;}
  if(paused)return state;
  const dt=Number.isFinite(delta)?Math.max(0,delta):0;
  if(active){
    if(state.opacity<=0)state.progress=0;
    state.opacity=1;
    state.progress=reducedMotion?1:Math.min(1,state.progress+dt/1.2);
  }else{
    state.opacity=Math.max(0,state.opacity-dt/.5);
    if(state.opacity===0)state.progress=0;
  }
  return state;
}
export const stepIceWave=stepThermalWave;

export function createIceSnow(count=96,random=Math.random){
  return Array.from({length:count},()=>({
    x:random(),y:random(),phase:random()*Math.PI*2,
    drift:2+random()*4,speed:5+random()*7,size:1.8+random()*2.8,
    opacity:.38+random()*.28,
  }));
}

export function stepThermalParticles(state,{visible,paused=false,reducedMotion=false,delta=0}){
  if(!visible){state.time=0;return state;}
  if(!paused&&!reducedMotion&&Number.isFinite(delta))state.time+=Math.max(0,delta);
  return state;
}
export const stepIceSnow=stepThermalParticles;

export function iceSnowPose(flake,{width,height,time,progress,opacity}){
  const wrap=value=>((value%1)+1)%1;
  const x=wrap(flake.x+Math.sin(time*.35+flake.phase)*flake.drift/width);
  const y=wrap(flake.y-time*flake.speed/height);
  // A flake emerges only after its own patch is visibly blue. Its soft entry
  // follows the wave instead of an unrelated global particle fade.
  const coverage=iceWaveCoverage(progress,x,y);
  const alpha=flake.opacity*smooth(.12,.88,coverage)*smooth(0,1,opacity);
  return {x:x*width,y:y*height,alpha};
}

export function iceSnowMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:false,
    uniforms:{color:{value:new THREE.Color(DESIGN.palette.ice[0])},pointScale:{value:1}},
    vertexShader:`attribute float size,alpha;varying float vAlpha;uniform float pointScale;
      void main(){vAlpha=alpha;gl_PointSize=size*pointScale;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float vAlpha;uniform vec3 color;
      void main(){
        float softFlake=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));
        gl_FragColor=vec4(color,vAlpha*softFlake);
        #include <colorspace_fragment>
      }`,
  });
}

export function createFireEmbers(count=72,random=Math.random){
  return Array.from({length:count},(_,index)=>({
    x:random(),y:random(),phase:random()*Math.PI*2,
    drift:4+random()*7,speed:18+random()*18,
    // A few readable streaks sit among the tiny embers, keeping the cue clear
    // on phone displays without filling the field with large particles.
    size:index%4===0?7.5+random()*3:2.5+random()*3.2,
    opacity:index%4===0?.82+random()*.16:.50+random()*.35,
  }));
}

export function fireEmberPose(ember,{width,height,time,progress,opacity}){
  const wrap=value=>((value%1)+1)%1;
  const x=wrap(ember.x+Math.sin(time*.6+ember.phase)*ember.drift/width);
  const y=wrap(ember.y+time*ember.speed/height);
  const coverage=fireWaveCoverage(progress,x,y);
  const glow=.78+.22*Math.sin(time*.9+ember.phase);
  const alpha=ember.opacity*glow*smooth(.12,.88,coverage)*smooth(0,1,opacity);
  return {x:x*width,y:y*height,alpha};
}

export function fireEmberMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:false,
    uniforms:{color:{value:new THREE.Color(DESIGN.palette.fire[1])},hot:{value:new THREE.Color(DESIGN.palette.fire[0])},pointScale:{value:1}},
    vertexShader:`attribute float size,alpha;varying float vAlpha;uniform float pointScale;
      void main(){vAlpha=alpha;gl_PointSize=size*pointScale;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float vAlpha;uniform vec3 color,hot;
      void main(){
        float distance=length((gl_PointCoord-.5)*vec2(1.4,.8));
        float core=1.-smoothstep(.06,.25,distance);
        float glow=1.-smoothstep(.06,.5,distance);
        gl_FragColor=vec4(mix(color,hot,core),vAlpha*glow);
        #include <colorspace_fragment>
      }`,
  });
}

export function atmosphereMaterial({veil=false}={}) {
  const p = DESIGN.palette;
  return new THREE.ShaderMaterial({
    depthWrite: false, depthTest: !veil, transparent: veil,
    uniforms: {
      veil: { value: veil?1:0 }, fieldHeight: { value: 640 },
      veilBands: { value: new THREE.Vector4(54,104,508,544) },
      sky: { value: new THREE.Color(p.sky) }, mist: { value: new THREE.Color(p.mist) },
      magenta: { value: new THREE.Color(p.magenta) }, ember: { value: new THREE.Color(p.ember) },
      horizon: { value: new THREE.Color(p.horizon) }, time: { value: 0 },
      grainAmount: { value: DESIGN.atmosphere.grainAmount }, fogAmount: { value: DESIGN.atmosphere.fogAmount },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 sky,mist,horizon,magenta,ember; uniform float time,grainAmount,fogAmount,veil,fieldHeight; uniform vec4 veilBands;
      void main(){
        vec2 uv=vUv;
        float y=(1.-uv.y)*fieldHeight;
        float cover=max(1.-smoothstep(veilBands.x,veilBands.y,y),smoothstep(veilBands.z,veilBands.w,y));
        if(veil>.5&&cover<=0.)discard;
        float height=uv.y+sin(uv.x*3.1)*.055;
        vec3 col=mix(horizon,ember,smoothstep(.02,.48,height));
        col=mix(col,magenta,smoothstep(.28,.77,height));
        col=mix(col,mist,smoothstep(.64,.84,height)*.65);
        col=mix(col,sky,smoothstep(.76,1.08,height));
        float glow=exp(-length((uv-vec2(.12,.15))*vec2(1.7,2.4))*4.0);
        col=mix(col,horizon,glow*.23);
        float fog=sin(uv.y*17.0+sin(uv.x*6.0+time*.06)*.9)*.5+.5;
        col=mix(col,mist,fog*fogAmount);
        float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
        col+=grain*grainAmount;
        gl_FragColor=vec4(col,mix(1.,cover,veil));
        #include <colorspace_fragment>
      }`,
  });
}

export function smokeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: {
      tint:{value:new THREE.Color(DESIGN.palette.smoke)},
      shade:{value:new THREE.Color(DESIGN.palette.smokeTile[1])},
      highlight:{value:new THREE.Color(DESIGN.palette.smoke).lerp(new THREE.Color(DESIGN.palette.smokeInk[0]),.22)},
      opacity:{value:1},seed:{value:0},time:{value:0},dissolve:{value:0},
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform vec3 tint,shade,highlight; uniform float opacity,seed,time,dissolve;
      float hash(float n){return fract(sin(n*127.1+seed*311.7)*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i.x+i.y*57.),hash(i.x+1.+i.y*57.),f.x),
          mix(hash(i.x+(i.y+1.)*57.),hash(i.x+1.+(i.y+1.)*57.),f.x),f.y);
      }
      float unionCloud(float a,float b){
        float h=clamp(.5+.5*(b-a)/.13,0.,1.);
        return mix(b,a,h)-.13*h*(1.-h);
      }
      void main(){
        vec2 p=(vUv-.5)*2.;
        // An asymmetric opaque core plus a seed-specific cluster of lobes:
        // clouds differ in silhouette as well as overall size and rotation.
        vec2 core=(vec2(hash(2.),hash(3.))-.5)*.13;
        vec2 coreShape=vec2(.88+hash(4.)*.25,.86+hash(5.)*.28);
        float edge=length((p-core)/coreShape)-(.43+hash(6.)*.07);
        vec2 coreDelta=(p-core)/(coreShape*.48);
        float corePuff=exp(-dot(coreDelta,coreDelta)*1.6);
        vec2 slope=coreDelta*corePuff*2.;
        vec2 coreCrest=coreDelta-vec2(-.15,.18);
        float crest=exp(-dot(coreCrest,coreCrest)*2.2);
        float lobeCount=5.+floor(hash(7.)*5.);
        for(int i=0;i<9;i++){
          float n=float(i);
          if(n<lobeCount){
            float angle=n*6.2831853/lobeCount+(hash(n+20.)-.5)*.95;
            float reach=.24+hash(n+40.)*.25;
            vec2 center=vec2(cos(angle),sin(angle))*reach+core*.5;
            float radius=.22+hash(n+60.)*.14+sin(time*.55+n+seed)*.009;
            edge=unionCloud(edge,length(p-center)-radius);
            vec2 delta=(p-center)/radius;
            float puff=exp(-dot(delta,delta)*1.65);
            slope+=delta*puff*1.4;
            vec2 cap=delta-vec2(-.12,.15);
            crest=max(crest,exp(-dot(cap,cap)*2.2));
          }
        }
        float billow=noise(p*(3.2+hash(9.)*1.5)+vec2(time*.035,-time*.025));
        float detail=noise(p*7.8+vec2(-time*.019,time*.028)+seed*.013);
        edge+=(billow-.5)*.065+(detail-.5)*.025+dissolve*(.13+detail*.22);
        float body=1.-smoothstep(-.15,.045,edge);
        // A thin, uneven outer veil supplies wisps without moving the anchor
        // or extending the obstruction's original size budget.
        float wisp=(1.-smoothstep(-.02,.18,edge))*smoothstep(.25,.76,detail)*.24;
        float alpha=max(body,wisp)*opacity;
        // Rounded lobe normals and broad pink crests give each puff volume;
        // darker magenta pockets keep the average hue close to the gas tile.
        vec3 normal=normalize(vec3(slope*.85,.62));
        float diffuse=dot(normal,normalize(vec3(-.55,.8,.9)))*.5+.5;
        float light=clamp(diffuse*.55+crest*.35+billow*.10,0.,1.);
        vec3 col=mix(shade,tint,smoothstep(.15,.62,light));
        col=mix(col,highlight,smoothstep(.56,.94,light)*.85);
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`,
  });
}
