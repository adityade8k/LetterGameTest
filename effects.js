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
  function smokePatches(width, height, settings, random = Math.random) {
    const patches=[],short=Math.min(width,height),firstSide=random()<.5?-1:1;
    for(let index=0;index<settings.patchCount;index++){
      let best,clearance=-Infinity;
      // Free placement with spaced centers, rather than the same four quadrants.
      for(let attempt=0;attempt<24;attempt++){
        const candidate={x:.12+.76*((random()+attempt*.618034)%1),y:.12+.76*((random()+attempt*.754878)%1)};
        const nearest=patches.reduce((distance,p)=>Math.min(distance,Math.hypot((p.x-candidate.x)*width/short,(p.y-candidate.y)*height/short)),Infinity);
        if(nearest>clearance){best=candidate;clearance=nearest;}
        if(nearest>=settings.radiusFraction*1.5)break;
      }
      patches.push({...best,radius:settings.radiusFraction*(.84+random()*.3),phase:random()*Math.PI*2,
        seed:random()*1000,aspect:.85+random()*.3,delay:random()*.12,
        side:index%2?-firstSide:firstSide,exitSide:random()<.8?(index%2?-firstSide:firstSide):(index%2?firstSide:-firstSide),
        entryY:Math.max(.05,Math.min(.95,best.y+(random()-.5)*.3)),exitY:Math.max(.05,Math.min(.95,best.y+(random()-.5)*.3))});
    }
    return patches;
  }
  function smokePose(patch,age,remaining,width,height,settings,reducedMotion=false){
    const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
    const localAge=Math.max(0,age-patch.delay),diameter=Math.min(width,height)*patch.radius*2;
    const enter=smooth(localAge/settings.enterSeconds),leave=smooth(1-remaining/settings.exitSeconds);
    const drift=reducedMotion?0:settings.driftPixelsPerSecond*localAge;
    const targetX=patch.x*width+Math.sin(localAge*.65+patch.phase)*drift;
    const targetY=patch.y*height+Math.cos(localAge*.45+patch.phase)*drift;
    const outside=diameter*.75*Math.max(patch.aspect,1/patch.aspect);
    const fromX=patch.side<0?-outside:width+outside,toX=patch.exitSide<0?-outside:width+outside;
    const mix=(a,b,t)=>a+(b-a)*t;
    return {
      x:reducedMotion?targetX:mix(mix(fromX,targetX,enter),toX,leave),
      y:reducedMotion?targetY:mix(mix(patch.entryY*height,targetY,enter),patch.exitY*height,leave),
      diameter:diameter*(reducedMotion?1:.9+.1*enter),
      opacity:smokeEnvelope(age,remaining,settings,patch.delay),localAge,
    };
  }
  function smokeEnvelope(age,remaining,settings,delay=0){
    if(age<=delay||remaining<=0)return 0;
    const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
    const fadeIn=settings.fadeInSeconds>0?smooth((age-delay)/settings.fadeInSeconds):1;
    const fadeOut=settings.fadeOutSeconds>0?smooth(remaining/settings.fadeOutSeconds):1;
    return settings.opacity*fadeIn*fadeOut;
  }
  return { hourglassPosition, smokePatches, smokeEnvelope, smokePose };
});
