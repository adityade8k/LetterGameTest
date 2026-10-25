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
    const patches=[],short=Math.min(width,height);
    const hasOrigin=Number.isFinite(origin?.x)&&Number.isFinite(origin?.y);
    // Give each cloud a different size band, then shuffle the bands so the
    // largest obstruction does not keep occupying the first sampled location.
    const sizeBands=Array.from({length:settings.patchCount},(_,index)=>index);
    for(let index=sizeBands.length-1;index>0;index--){
      const swap=Math.min(index,Math.floor(random()*(index+1)));
      [sizeBands[index],sizeBands[swap]]=[sizeBands[swap],sizeBands[index]];
    }
    for(let index=0;index<settings.patchCount;index++){
      const radius=settings.radiusFraction*(.64+.70*(sizeBands[index]+random())/settings.patchCount);
      let best,clearance=-Infinity;
      // In-field anchors favor different exposed regions, without fixed
      // quadrants or offscreen entry/exit paths. UI is drawn above the smoke.
      for(let attempt=0;attempt<24;attempt++){
        const candidate={x:.14+.72*((random()+attempt*.618034)%1),y:.20+.54*((random()+attempt*.754878)%1)};
        const nearest=patches.reduce((distance,p)=>Math.min(distance,Math.hypot((p.x-candidate.x)*width/short,(p.y-candidate.y)*height/short)),Infinity);
        if(nearest>clearance){best=candidate;clearance=nearest;}
        if(nearest>=settings.radiusFraction*1.5)break;
      }
      if(index===0&&hasOrigin){
        best={x:Math.max(.14,Math.min(.86,origin.x/width)),y:Math.max(.20,Math.min(.74,origin.y/height))};
      }
      patches.push({...best,radius,phase:random()*Math.PI*2,
        seed:random()*1000+index*.731,aspect:.73+random()*.62,delay:index===0&&hasOrigin?0:random()*.12});
    }
    return patches;
  }
  function smokePose(patch,age,remaining,width,height,settings,reducedMotion=false){
    const localAge=Math.max(0,age-patch.delay),baseDiameter=Math.min(width,height)*patch.radius*2;
    const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
    const bloom=reducedMotion?1:.88+.12*smooth(localAge/.75);
    // Drift is a tiny orbit around the anchor, never velocity accumulated over
    // the effect's lifetime. Even aggressive tuning cannot sweep a cloud away.
    const drift=reducedMotion?0:Math.min(4,Math.max(0,settings.driftPixelsPerSecond));
    const dx=(Math.sin(localAge*.42+patch.phase)-Math.sin(patch.phase))*drift*.5;
    const dy=(Math.cos(localAge*.36+patch.phase*1.7)-Math.cos(patch.phase*1.7))*drift*.35;
    return {
      x:patch.x*width+dx,
      y:patch.y*height+dy,
      diameter:baseDiameter*bloom,
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
