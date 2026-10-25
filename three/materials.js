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

const ICE_WAVE={start:-.17,end:1.17,feather:.12,ripple:.025,frequency:5.7};
const smooth=(a,b,value)=>{const t=Math.min(1,Math.max(0,(value-a)/(b-a)));return t*t*(3-2*t);};

// The compositor and snow use the same wave shape, in bottom-up field UVs.
export function iceWaveCoverage(progress,x,y){
  const eased=smooth(0,1,progress);
  const front=ICE_WAVE.start+(ICE_WAVE.end-ICE_WAVE.start)*eased+Math.sin(x*ICE_WAVE.frequency)*ICE_WAVE.ripple;
  return 1-smooth(front-ICE_WAVE.feather,front+ICE_WAVE.feather,y);
}

export function iceTintMaterial(){
  return new THREE.ShaderMaterial({
    depthWrite:false,depthTest:false,
    uniforms:{
      source:{value:null},tint:{value:new THREE.Color(DESIGN.palette.iceTint)},
      dark:{value:new THREE.Color(DESIGN.palette.iceInk[0])},
      light:{value:new THREE.Color(DESIGN.palette.ice[0])},
      opacity:{value:0},progress:{value:0},strength:{value:.92},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D source;
      uniform vec3 tint,dark,light;uniform float opacity,progress,strength;
      void main(){
        // The source is linear light. Preserve the letters' contrast while
        // replacing warm hues throughout the field with the ice tile palette.
        vec3 original=texture2D(source,vUv).rgb;
        float luminance=dot(original,vec3(.2126,.7152,.0722));
        vec3 frozen=mix(dark,tint,smoothstep(.015,.62,luminance));
        frozen=mix(frozen,light,smoothstep(.58,.98,luminance));
        float eased=progress*progress*(3.-2.*progress);
        float front=mix(${ICE_WAVE.start},${ICE_WAVE.end},eased)+sin(vUv.x*${ICE_WAVE.frequency})*${ICE_WAVE.ripple};
        float wave=1.-smoothstep(front-${ICE_WAVE.feather},front+${ICE_WAVE.feather},vUv.y);
        float fade=opacity*opacity*(3.-2.*opacity);
        gl_FragColor=vec4(mix(original,frozen,wave*fade*strength),1.);
        #include <colorspace_fragment>
      }`,
  });
}

// Seconds here are real active seconds, independent of the slowed game clock.
// Refreshing a pickup extends its duration without sending the wave backwards.
export function stepIceWave(state,{active,paused=false,reducedMotion=false,delta=0}){
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

export function createIceSnow(count=96,random=Math.random){
  return Array.from({length:count},()=>({
    x:random(),y:random(),phase:random()*Math.PI*2,
    drift:2+random()*4,speed:5+random()*7,size:1.8+random()*2.8,
    opacity:.38+random()*.28,
  }));
}

export function stepIceSnow(state,{visible,paused=false,reducedMotion=false,delta=0}){
  if(!visible){state.time=0;return state;}
  if(!paused&&!reducedMotion&&Number.isFinite(delta))state.time+=Math.max(0,delta);
  return state;
}

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
        float height=uv.y+sin(uv.x*3.1)*.055;
        vec3 col=mix(horizon,ember,smoothstep(.02,.48,height));
        col=mix(col,magenta,smoothstep(.28,.77,height));
        col=mix(col,sky,smoothstep(.62,1.02,height));
        float glow=exp(-length((uv-vec2(.12,.15))*vec2(1.7,2.4))*4.0);
        col=mix(col,horizon,glow*.23);
        float fog=sin(uv.y*17.0+sin(uv.x*6.0+time*.06)*.9)*.5+.5;
        col=mix(col,mist,fog*fogAmount);
        float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
        col+=grain*grainAmount;
        float y=(1.-uv.y)*fieldHeight;
        float cover=max(1.-smoothstep(veilBands.x,veilBands.y,y),smoothstep(veilBands.z,veilBands.w,y));
        gl_FragColor=vec4(col,mix(1.,cover,veil));
        #include <colorspace_fragment>
      }`,
  });
}

export function smokeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { tint: { value: new THREE.Color(DESIGN.palette.smoke) }, opacity: { value: 1 }, seed:{value:0}, time:{value:0} },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity,seed,time;
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
        float lobeCount=5.+floor(hash(7.)*5.);
        for(int i=0;i<9;i++){
          float n=float(i);
          if(n<lobeCount){
            float angle=n*6.2831853/lobeCount+(hash(n+20.)-.5)*.95;
            float reach=.24+hash(n+40.)*.25;
            vec2 center=vec2(cos(angle),sin(angle))*reach+core*.5;
            float radius=.22+hash(n+60.)*.14+sin(time*.55+n+seed)*.009;
            edge=unionCloud(edge,length(p-center)-radius);
          }
        }
        float billow=noise(p*(3.2+hash(9.)*1.5)+vec2(time*.045,-time*.035));
        edge+=(billow-.5)*.055+(1.-opacity)*(.10+billow*.055);
        float alpha=(1.-smoothstep(-.13,.025,edge))*opacity;
        float light=clamp(.46+.25*p.y+.29*billow,0.,1.);
        vec3 col=tint*(.88+.18*light);
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`,
  });
}
