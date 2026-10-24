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

export function atmosphereMaterial() {
  const p = DESIGN.palette;
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      sky: { value: new THREE.Color(p.sky) }, mist: { value: new THREE.Color(p.mist) },
      magenta: { value: new THREE.Color(p.magenta) }, ember: { value: new THREE.Color(p.ember) },
      horizon: { value: new THREE.Color(p.horizon) }, time: { value: 0 },
      grainAmount: { value: DESIGN.atmosphere.grainAmount }, fogAmount: { value: DESIGN.atmosphere.fogAmount },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 sky,mist,horizon,magenta,ember; uniform float time,grainAmount,fogAmount;
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
        gl_FragColor=vec4(col,1.0);
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
        float edge=length(p)-.53;
        for(int i=0;i<7;i++){
          float n=float(i),angle=n*6.2831853/7.+hash(n+20.)*.55;
          float reach=.32+hash(n+40.)*.15;
          vec2 center=vec2(cos(angle),sin(angle))*reach;
          float radius=.27+hash(n+60.)*.12+sin(time*.7+n+seed)*.012;
          edge=unionCloud(edge,length(p-center)-radius);
        }
        float billow=noise(p*3.8+vec2(time*.09,-time*.07));
        edge+=(billow-.5)*.055;
        float alpha=(1.-smoothstep(-.13,.025,edge))*opacity;
        float light=clamp(.46+.25*p.y+.29*billow,0.,1.);
        vec3 col=mix(tint*.88,mix(tint,vec3(1.,.77,.82),.48),light);
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`,
  });
}
