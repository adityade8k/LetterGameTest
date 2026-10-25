import * as THREE from 'three';
import { THERMAL_WAVE } from './materials.js';

export function createThermalUniforms(){
  return {
    thermalTint:{value:new THREE.Color()},thermalDark:{value:new THREE.Color()},thermalLight:{value:new THREE.Color()},
    thermalAmount:{value:new THREE.Vector4(0,0,0,0)},thermalResolution:{value:new THREE.Vector2(1,1)},
  };
}

const thermalShader=`
uniform vec3 thermalTint,thermalDark,thermalLight;
uniform vec4 thermalAmount;
uniform vec2 thermalResolution;
vec3 clttrThermal(vec3 original){
  if(thermalAmount.y<=0.)return original;
  vec2 uv=gl_FragCoord.xy/thermalResolution;
  // The reveal completes after 1.2 seconds. Skip its spatial calculations
  // throughout the longer fully covered portion and its release fade.
  float wave=1.;
  if(thermalAmount.x<1.){
    vec2 uv=gl_FragCoord.xy/thermalResolution;
    float progress=thermalAmount.x;
    float eased=progress*progress*(3.-2.*progress);
    float front=mix(${THERMAL_WAVE.start},${THERMAL_WAVE.end},eased)+sin(uv.x*${THERMAL_WAVE.frequency})*${THERMAL_WAVE.ripple};
    float y=mix(uv.y,1.-uv.y,thermalAmount.w);
    wave=1.-smoothstep(front-${THERMAL_WAVE.feather},front+${THERMAL_WAVE.feather},y);
  }
  if(wave<=0.)return original;
  float luminance=dot(original,vec3(.2126,.7152,.0722));
  vec3 mapped=mix(thermalDark,thermalTint,smoothstep(.015,.62,luminance));
  mapped=mix(mapped,thermalLight,smoothstep(.58,.98,luminance));
  float opacity=thermalAmount.y;
  float fade=opacity*opacity*(3.-2.*opacity);
  return mix(original,mapped,wave*fade*thermalAmount.z);
}
`;

// Opt-in only: UI materials never pass through here. Cloned playfield materials
// keep independent opacity/reflection uniforms but reattach the same climate
// handles, so no per-material updates or per-effect render targets are needed.
export function bindThermalMaterial(material,uniforms){
  if(!material.userData.clttrThermal){
    const output='#include <colorspace_fragment>';
    if(!material.fragmentShader.includes(output))throw new Error('Thermal materials need a linear color output');
    material.fragmentShader=thermalShader+material.fragmentShader.replace(output,`if(gl_FragColor.a<=0.)discard;\ngl_FragColor.rgb=clttrThermal(gl_FragColor.rgb);\n${output}`);
    material.userData.clttrThermal=true;material.needsUpdate=true;
  }
  Object.assign(material.uniforms,uniforms);
  return material;
}

export function updateThermalUniforms(uniforms,layer){
  if(!layer){uniforms.thermalAmount.value.y=0;return;}
  const palette=layer.material.uniforms;
  uniforms.thermalTint.value=palette.tint.value;
  uniforms.thermalDark.value=palette.dark.value;
  uniforms.thermalLight.value=palette.light.value;
  uniforms.thermalAmount.value.set(layer.wave.progress,layer.wave.opacity,palette.strength.value,palette.reverse.value);
}
