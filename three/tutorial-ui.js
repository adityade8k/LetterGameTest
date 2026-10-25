import * as THREE from 'three';

// The coach card, buttons and target glow are meshes in the existing UI scene.
export function createTutorialUI({scene,group,slot,plinth,text,lines,button,materials}){
  const root=group(scene,0,0,22),glowRoot=group(scene,0,0,18);
  root.visible=glowRoot.visible=false;
  const glowMaterial=new THREE.ShaderMaterial({
    transparent:true,depthTest:false,depthWrite:false,
    uniforms:{size:{value:new THREE.Vector2(60,60)},pulse:{value:0},tone:{value:new THREE.Color('#ffd879')}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform vec2 size;uniform float pulse;uniform vec3 tone;
      void main(){vec2 p=abs((vUv-.5)*(size+32.))-size*.5+10.;
        float d=length(max(p,0.))+min(max(p.x,p.y),0.)-10.;
        float rim=(1.-smoothstep(1.5,3.5,abs(d)))*.9;
        float halo=exp(-abs(d)*.18)*(.18+pulse*.12);
        gl_FragColor=vec4(tone,clamp(rim+halo,0.,1.));
        #include <colorspace_fragment>
      }`,
  });
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),glowMaterial);
  glow.userData.tutorialHighlight=true;glowRoot.add(glow);
  let state=null,layout=null;
  function resize(next){layout=next;root.position.y=glowRoot.position.y=next.height/2-next.top;}
  function sync(next){
    state=next;root.visible=glowRoot.visible=Boolean(state);
    if(!state)return;
    const signature=JSON.stringify([state.id,state.title,state.detail,state.completed,state.canContinue,state.previewActive,state.stepIndex,state.nextLabel]);
    slot('tutorial-card',root,signature,g=>{
      text(g,`HOW TO PLAY  ${state.stepIndex+1} / ${state.stepCount}`,24,101,{size:7.5,material:'ink',spacing:.2});
      const exit=button(g,'tutorial-exit','Exit',282,91,54,28,{small:true});exit.label='Exit tutorial';
      plinth(g,18,134,324,136,16);
      text(g,state.title,180,151,{size:17,align:'center',raised:true,maxWidth:285});
      lines(g,state.detail,180,181,{width:282,size:9,lineHeight:15,align:'center',material:'ink'});
      if(state.canContinue){
        const next=button(g,'tutorial-next',state.nextLabel||'Next',112,230,136,29,{gold:true});
        next.label=state.nextLabel||'Next tutorial step';
      }else if(!state.completed||state.previewActive)text(g,state.previewActive?'Watch what happens…':'Follow the glow',180,242,{size:7.5,align:'center',material:'muted'});
    });
    const target=state.highlightRect;
    glow.visible=Boolean(target);
    if(target){
      glow.position.set(target.x+target.w/2,-target.y-target.h/2,0);
      glow.scale.set(target.w+32,target.h+32,1);
      glowMaterial.uniforms.size.value.set(target.w,target.h);
      glowMaterial.uniforms.tone.value.set(state.target==='undo'?'#ff8998':'#ffd879');
    }
  }
  return {
    sync,resize,
    animate(reducedMotion){glowMaterial.uniforms.pulse.value=reducedMotion?0:(Math.sin((state?.visualTime||0)*3.2)+1)/2;},
    obscures(x,y,margin=0){
      if(!state||!layout)return false;
      x-=layout.left;y-=layout.top;
      return x>18-margin&&x<342+margin&&y>91-margin&&y<270+margin;
    },
  };
}
