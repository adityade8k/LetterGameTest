/* Random pickup and smoke placement, also used by the tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterfallEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function hourglassPosition(width, size, occupied = [], random = Math.random) {
    const margin = size / 2 + 18;
    let best, clearance = -Infinity;
    // Enter above the field at a random horizontal position, favoring a gap.
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = {
        x: Math.min(margin, width / 2) + random() * Math.max(0, width - margin * 2),
        y: -size,
      };
      const distance = occupied.reduce((nearest, tile) => Math.min(nearest, Math.hypot(tile.x - position.x, tile.y - position.y)), Infinity);
      if (distance > clearance) { best = position; clearance = distance; }
      if (distance >= size * 1.3) break;
    }
    return best;
  }
  function smokePatches(width, height, settings, random = Math.random, origin = null) {
    const patches=[];
    const firstSide=random()<.5?-1:1;
    // Stagger broad banks from alternating edges so the haze spreads across
    // the field without mirrored rows or a single opaque rectangle. Origin is
    // intentionally accepted for older callers: smoke now comes from the sides.
    for(let index=0;index<settings.patchCount;index++){
      const side=index%2===0?firstSide:-firstSide;
      patches.push({
        side,
        x:.5+side*(.025+random()*.035),
        y:.24+.56*index/Math.max(1,settings.patchCount-1)+(random()-.5)*.025,
        width:.95+random()*.15,
        height:.40+random()*.04,
        phase:random()*Math.PI*2,
        seed:random()*1000+index*.731,
        delay:index<2?0:.035+random()*.085,
      });
    }
    return patches;
  }
  function smokePose(patch,age,remaining,width,height,settings,reducedMotion=false){
    const localAge=Math.max(0,age-patch.delay);
    const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
    const entry=settings.enterSeconds>0?smooth(localAge/settings.enterSeconds):1;
    const targetX=patch.x*width,targetY=patch.y*height;
    const bankWidth=patch.width*width,bankHeight=patch.height*height;
    // Start the entire quad just beyond its edge, ease inward once, then stay
    // nearby as the haze dissipates. The entry never reverses into a slide out.
    const startX=patch.side<0?-bankWidth*.5-2:width+bankWidth*.5+2;
    const settledAge=Math.max(0,localAge-settings.enterSeconds);
    const drift=reducedMotion?0:Math.min(4,Math.max(0,settings.driftPixelsPerSecond));
    const settling=1-Math.exp(-settledAge*settledAge*.15);
    const dx=-patch.side*drift*settling;
    const dy=Math.sin(patch.phase)*drift*.35*settling;
    return {
      x:reducedMotion?targetX:startX+(targetX-startX)*entry+dx,
      y:targetY+dy,
      width:bankWidth,
      height:bankHeight,
      opacity:smokeEnvelope(age,remaining,settings,patch.delay),localAge,
      dissolve:settings.fadeOutSeconds>0?smooth(1-remaining/settings.fadeOutSeconds):0,
    };
  }
  function smokeEnvelope(age,remaining,settings,delay=0){
    if(age<=delay||remaining<=0)return 0;
    const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
    const fadeIn=settings.fadeInSeconds>0?smooth((age-delay)/settings.fadeInSeconds):1;
    const fadeOut=settings.fadeOutSeconds>0?smooth(remaining/settings.fadeOutSeconds):1;
    return settings.opacity*fadeIn*fadeOut;
  }
  function gasPulse(elapsed,phase=0,{blocked=false,reducedMotion=false}={}){
    if(blocked||reducedMotion)return 0;
    const breath=.5+.5*Math.sin(Math.max(0,elapsed)*2.35+phase);
    return breath*breath;
  }
  return { hourglassPosition, smokePatches, smokeEnvelope, smokePose, gasPulse };
});
