import * as THREE from 'three';
import { smokeMaterial } from './materials.js';

export function smokeAtlasLayout(count=16,cellSize=192,gutter=4){
  const columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns);
  const width=columns*cellSize,height=rows*cellSize,inner=cellSize-gutter*2;
  return {count,width,height,cellSize,gutter,rect(index){
    const x=(index%columns)*cellSize+gutter,y=Math.floor(index/columns)*cellSize+gutter;
    return {x,y,size:inner,uv:[(x+.5)/width,(y+.5)/height,(inner-1)/width,(inner-1)/height]};
  }};
}

// Bake the expensive lobe normals and procedural billows once during loading.
// A burst samples four distinct variants, then varies rotation, aspect, size,
// anchors and a tiny UV drift. The original shape shader never runs per frame.
export function createSmokeAtlas(renderer){
  const layout=smokeAtlasLayout();
  const target=new THREE.WebGLRenderTarget(layout.width,layout.height,{
    depthBuffer:false,stencilBuffer:false,samples:0,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
  });
  target.texture.generateMipmaps=false;
  const material=smokeMaterial();material.transparent=false;material.blending=THREE.NoBlending;
  const geometry=new THREE.PlaneGeometry(2,2),scene=new THREE.Scene();
  scene.add(new THREE.Mesh(geometry,material));
  let cachedMaterial=null;
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
  const previous={target:renderer.getRenderTarget(),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha()};
  try{
    renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear();
    for(let index=0;index<layout.count;index++){
      const rect=layout.rect(index);
      // Target viewports use physical pixels. renderer.setViewport would
      // multiply by the canvas DPR and clip atlas cells on retina screens.
      target.viewport.set(rect.x,rect.y,rect.size,rect.size);renderer.setRenderTarget(target);
      material.uniforms.seed.value=17.371+index*67.173;
      renderer.render(scene,camera);
    }
    // Keep one compiled sampler material alive between bursts. Disposing the
    // four previous cloud materials must not evict its program and cause a new
    // shader compilation on the next gas pickup.
    cachedMaterial=sampledSmokeMaterial({texture:target.texture,layout});
    // Warm the display-color program, not the atlas's linear-output variant.
    // Three.js includes the current render target's color space in its key.
    renderer.setRenderTarget(previous.target);
    scene.children[0].material=cachedMaterial;renderer.compile(scene,camera);
  }catch(error){
    cachedMaterial?.dispose();target.dispose();throw error;
  }finally{
    renderer.setRenderTarget(previous.target);
    renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.color,previous.alpha);
    material.dispose();geometry.dispose();
  }
  return {texture:target.texture,layout,dispose(){cachedMaterial.dispose();target.dispose();}};
}

export function sampledSmokeMaterial(atlas,index=0){
  const uv=atlas.layout.rect(index%atlas.layout.count).uv;
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:false,
    uniforms:{atlas:{value:atlas.texture},atlasRect:{value:new THREE.Vector4(...uv)},opacity:{value:1},time:{value:0},seed:{value:0},dissolve:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D atlas;uniform vec4 atlasRect;
      uniform float opacity,time,seed,dissolve;
      void main(){
        vec2 drift=vec2(sin(vUv.y*6.2+time*.45+seed),cos(vUv.x*5.4+time*.3+seed))*.0025;
        vec2 uv=atlasRect.xy+clamp(vUv+drift,0.,1.)*atlasRect.zw;
        vec4 puff=texture2D(atlas,uv);
        float detail=clamp((puff.r-puff.g)*2.,0.,1.);
        float erosion=dissolve*(.18+detail*.14);
        float coverage=max(0.,(puff.a-erosion)/max(.01,1.-erosion));
        if(coverage<=0.)discard;
        gl_FragColor=vec4(puff.rgb,coverage*opacity);
        #include <colorspace_fragment>
      }`,
  });
}
