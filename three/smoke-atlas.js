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

// Bake the broad density folds once during loading. A burst samples four
// distinct horizontal banks, varying their size and arrival from either side.
// The procedural shape shader never runs per frame.
export function createSmokeAtlas(renderer,sourceTexture=null){
  const layout=smokeAtlasLayout();
  const target=new THREE.WebGLRenderTarget(layout.width,layout.height,{
    depthBuffer:false,stencilBuffer:false,samples:0,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
  });
  target.texture.generateMipmaps=false;
  const material=sourceTexture?sourceSmokeMaterial(sourceTexture):smokeMaterial();
  material.transparent=false;material.blending=THREE.NoBlending;
  const geometry=new THREE.PlaneGeometry(2,2),scene=new THREE.Scene();
  scene.add(new THREE.Mesh(geometry,material));
  let cachedMaterial=null,alphaMasks=null;
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
      if(sourceTexture){
        const quadrant=index%4;
        material.uniforms.sourceRect.value.set((quadrant%2)*.5,Math.floor(quadrant/2)*.5,.5,.5);
        material.uniforms.flip.value.set(index&4?-1:1,index&8?-1:1);
      }
      renderer.render(scene,camera);
    }
    // Read a compact CPU density guide once during loading. It lets each new
    // arrangement hit the obstruction budget without GPU readbacks in play.
    if(renderer.readRenderTargetPixels){
      const pixels=new Uint8Array(layout.width*layout.height*4);
      renderer.readRenderTargetPixels(target,0,0,layout.width,layout.height,pixels);
      alphaMasks=smokeAlphaMasks(pixels,layout);
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
  return {texture:target.texture,layout,alphaMasks,dispose(){cachedMaterial.dispose();target.dispose();}};
}

// Row order follows WebGL readback (bottom to top), just like texture UVs.
export function smokeAlphaMasks(pixels,layout,size=32){
  return Array.from({length:layout.count},(_,index)=>{
    const rect=layout.rect(index),data=new Uint8Array(size*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const px=Math.floor(rect.x+.5+(x+.5)/size*(rect.size-1));
      const py=Math.floor(rect.y+.5+(y+.5)/size*(rect.size-1));
      data[y*size+x]=pixels[(py*layout.width+px)*4+3];
    }
    return {size,data};
  });
}

// Art is loaded once, then reduced to the same fixed-size atlas used by the
// procedural fallback. Four painted banks plus mirrors give 16 reusable forms.
function sourceSmokeMaterial(texture){
  return new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{source:{value:texture},sourceRect:{value:new THREE.Vector4()},flip:{value:new THREE.Vector2(1,1)},
      seed:{value:0},opacity:{value:1},time:{value:0},dissolve:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D source;uniform vec4 sourceRect;uniform vec2 flip;
      void main(){
        vec2 uv=(vUv-.5)*flip+.5;
        // Stay inside the source cell; feather the last few pixels so an artist
        // sprite touching its edge can never create a visible rectangle.
        uv=sourceRect.xy+mix(vec2(.002),vec2(.998),uv)*sourceRect.zw;
        vec4 haze=texture2D(source,uv);
        vec2 rim=min(vUv,1.-vUv);
        haze.a*=smoothstep(0.,.045,min(rim.x,rim.y));
        gl_FragColor=haze;
        #include <colorspace_fragment>
      }`,
  });
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
        vec2 drift=vec2(sin(vUv.y*6.2+time*.32+seed),cos(vUv.x*5.4+time*.24+seed))*.004;
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
