import * as THREE from 'three';

const ART_URL = 'assets/loading-clttr.jpg';
const clamp = value => Math.max(0, Math.min(1, value));

/** Draws the loading page through the game's existing WebGL context. */
export function createLoadingScreen(renderer, host, reducedMotion = false) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-180, 180, 320, -320, .1, 100);
  camera.position.z = 20;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials = new Set();
  const color = hex => new THREE.Color(hex);
  const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const canvas = renderer.domElement;
  let width = 360, height = 640, texture = null;
  let target = 0, shown = 0, frame = 0, previousTime = 0;
  let disposed = false, failed = false, finishPromise = null;

  canvas.setAttribute('role', 'progressbar');
  canvas.setAttribute('aria-label', 'Loading CLTTR');
  canvas.setAttribute('aria-valuemin', '0');
  canvas.setAttribute('aria-valuemax', '100');
  canvas.setAttribute('aria-valuenow', '0');
  canvas.setAttribute('aria-busy', 'true');

  function material(options) {
    const result = new THREE.ShaderMaterial({
      vertexShader, depthTest: false, depthWrite: false, ...options,
    });
    materials.add(result);
    return result;
  }

  // The background also fills the extra height of unusually tall phone screens.
  const backdropMaterial = material({
    uniforms: {
      lower: { value: color('#b84ed9') },
      middle: { value: color('#f69ab4') },
      upper: { value: color('#cd5acb') },
    },
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 lower,middle,upper;
      void main(){
        vec3 tone=mix(lower,middle,smoothstep(0.,.53,vUv.y));
        tone=mix(tone,upper,smoothstep(.52,1.,vUv.y));
        tone*=1.-.10*pow(abs(vUv.x-.5)*2.,2.);
        gl_FragColor=vec4(tone,1.);
        #include <colorspace_fragment>
      }`,
  });
  const backdrop = new THREE.Mesh(geometry, backdropMaterial);
  backdrop.renderOrder = 0;
  scene.add(backdrop);

  const artMaterial = material({
    transparent: true,
    uniforms: { art: { value: null }, feather: { value: new THREE.Vector2() } },
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D art;
      uniform vec2 feather;
      void main(){
        vec4 image=texture2D(art,vUv);
        vec2 edge=min(vUv,1.-vUv);
        vec2 fade=smoothstep(vec2(0.),max(feather,vec2(.000001)),edge);
        gl_FragColor=vec4(image.rgb,image.a*fade.x*fade.y);
        #include <colorspace_fragment>
      }`,
  });
  const art = new THREE.Mesh(geometry, artMaterial);
  art.position.z = 1;
  art.renderOrder = 1;
  art.visible = false;
  scene.add(art);

  // Rounded mesh layers make one soft, polished pill, without inset box outlines.
  function pill(top, bottom, gloss = 0, opacity = 1) {
    const surface = material({
      transparent: true,
      uniforms: {
        size: { value: new THREE.Vector2(1, 1) },
        topTone: { value: color(top) }, bottomTone: { value: color(bottom) },
        gloss: { value: gloss }, alpha: { value: opacity },
      },
      fragmentShader: `
        varying vec2 vUv;
        uniform vec2 size;
        uniform vec3 topTone,bottomTone;
        uniform float gloss,alpha;
        void main(){
          float radius=min(size.x,size.y)*.5;
          vec2 p=abs((vUv-.5)*size)-size*.5+radius;
          float distance=length(max(p,0.))+min(max(p.x,p.y),0.)-radius;
          float edge=max(fwidth(distance),.35);
          float opacity=1.-smoothstep(-edge,0.,distance);
          vec3 tone=mix(bottomTone,topTone,smoothstep(.02,.95,vUv.y));
          float shine=smoothstep(.52,.76,vUv.y)*(1.-smoothstep(.76,.98,vUv.y));
          tone=mix(tone,topTone,shine*gloss);
          gl_FragColor=vec4(tone,opacity*alpha);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, surface);
    scene.add(mesh);
    return mesh;
  }

  const shadow = pill('#552353', '#552353', 0, .30);
  const rim = pill('#ffe9a8', '#b45c47', .25);
  const well = pill('#6d315e', '#401b48', .20);
  const fill = pill('#fff0a9', '#f19139', .80);
  [shadow, rim, well, fill].forEach((mesh, index) => {
    mesh.position.z = 2 + index * .1;
    mesh.renderOrder = 2 + index;
  });
  let barWidth = 214, barHeight = 19, barY = -249.6;

  function sizePill(mesh, w, h, x, y) {
    mesh.scale.set(w, h, 1);
    mesh.position.x = x;
    mesh.position.y = y;
    mesh.material.uniforms.size.value.set(w, h);
  }

  function updateFill() {
    const inset = barHeight * .19;
    const innerWidth = barWidth - inset * 2;
    const fillWidth = innerWidth * shown;
    fill.visible = fillWidth > .4;
    sizePill(fill, Math.max(.001, fillWidth), barHeight - inset * 2,
      -innerWidth * .5 + fillWidth * .5, barY + .4);
  }

  function fitArt() {
    if (!texture) return;
    const image = texture.image;
    const imageRatio = image.width / image.height;
    const displayWidth = Math.min(width, height * imageRatio);
    const displayHeight = displayWidth / imageRatio;
    art.scale.set(displayWidth, displayHeight, 1);
    // Keep the complete title and illustration; gently blend only exposed edges.
    artMaterial.uniforms.feather.value.set(
      displayWidth < width - 1 ? .045 : 0,
      displayHeight < height - 1 ? .045 : 0,
    );
  }

  function render() {
    if (disposed) return;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, camera);
  }

  function resize() {
    if (disposed) return;
    const pixelWidth = Math.max(1, host.clientWidth);
    const pixelHeight = Math.max(1, host.clientHeight);
    width = 360;
    height = width * pixelHeight / pixelWidth;
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(pixelWidth, pixelHeight, false);
    backdrop.scale.set(width, height, 1);
    fitArt();
    barWidth = Math.min(width * .63, 238);
    barHeight = 19;
    barY = height * -.39;
    sizePill(shadow, barWidth + 3, barHeight + 4, 0, barY - 3);
    sizePill(rim, barWidth, barHeight, 0, barY);
    sizePill(well, barWidth - 4, barHeight - 4, 0, barY + .3);
    updateFill();
    render();
  }

  function animate(now) {
    frame = 0;
    if (disposed || failed) return;
    const dt = previousTime ? Math.min(64, now - previousTime) : 16;
    previousTime = now;
    shown += (target - shown) * (1 - Math.exp(-dt / 90));
    if (target - shown < .0005) shown = target;
    updateFill();
    render();
    if (shown < target) frame = requestAnimationFrame(animate);
    else previousTime = 0;
  }

  function setProgress(fraction) {
    if (disposed || failed || !Number.isFinite(fraction)) return;
    target = Math.max(target, clamp(fraction));
    canvas.setAttribute('aria-valuenow', String(Math.round(target * 100)));
    if (reducedMotion) {
      shown = target;
      updateFill();
      render();
    } else if (!frame && shown < target) {
      frame = requestAnimationFrame(animate);
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const ready = new THREE.TextureLoader().loadAsync(ART_URL).then(loaded => {
    if (disposed) { loaded.dispose(); return; }
    texture = loaded;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    artMaterial.uniforms.art.value = texture;
    art.visible = true;
    fitArt();
    render();
  }).catch(() => {
    // Artwork is decorative: a failed image must not prevent the game starting.
    render();
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    texture?.dispose();
    geometry.dispose();
    for (const surface of materials) surface.dispose();
    canvas.removeAttribute('aria-valuemin');
    canvas.removeAttribute('aria-valuemax');
    canvas.removeAttribute('aria-valuenow');
    canvas.removeAttribute('aria-valuetext');
    canvas.removeAttribute('aria-busy');
    // The parent owns the renderer, canvas, and the next screen's accessibility role.
  }

  function finish() {
    if (finishPromise) return finishPromise;
    if (disposed || failed) return Promise.resolve();
    // Paint before yielding: the parent may have just warmed the home frame.
    target = shown = 1;
    cancelAnimationFrame(frame); frame = 0;
    canvas.setAttribute('aria-valuenow', '100');
    updateFill();
    render();
    finishPromise = (async () => {
      await ready;
      if (disposed || failed) return;
      await new Promise(resolve => setTimeout(resolve, 150));
      dispose();
    })();
    return finishPromise;
  }

  async function fail(message = 'CLTTR could not finish loading. Please refresh to try again.') {
    if (disposed) return;
    failed = true;
    cancelAnimationFrame(frame); frame = 0;
    fill.material.uniforms.topTone.value.set('#ffc3b5');
    fill.material.uniforms.bottomTone.value.set('#d84f70');
    canvas.setAttribute('aria-label', message);
    canvas.setAttribute('aria-valuetext', message);
    canvas.setAttribute('aria-busy', 'false');
    render();
  }

  return { ready, setProgress, finish, fail, dispose };
}
