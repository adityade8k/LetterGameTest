// Screen-plane oriented-box contacts, in the same logical units as the game.
// No global clock or browser dependency: effects and pause supply scaled dt.
const radians = n => n * Math.PI / 180;
const randomRange = (min,max,random) => min+(max-min)*random();
export function prepareTile(tile,config,random=Math.random){
  const rotation=config.rotation,high=(config.letterPoints[tile.letter]||0)>=rotation.highValueMinPoints;
  tile.vx=0;tile.vy=null;tile.age=0;
  // All tiles turn around Y; letters linger face-on and cross the edge quickly.
  tile.pitch=0;tile.tilt=0;tile.pitchOffset=0;tile.yawOffset=0;tile.yaw=0;
  if(tile.kind==='hourglass'){
    tile.yaw=random()*Math.PI*2;
    tile.rotationSpeed=radians(config.hourglass.rotationDegreesPerSecond);
  }else{
    // Independent phase as well as speed/direction prevents a new cohort from
    // turning together. Start within 60 degrees of upright for readability.
    tile.spinPhase=(random()<.5?0:Math.PI)+randomRange(-Math.PI/3,Math.PI/3,random);
    tile.yaw=letterYaw(tile.spinPhase,rotation.faceTurnRatio);
    const low=high?(rotation.minDegreesPerSecond+rotation.maxDegreesPerSecond)/2:rotation.minDegreesPerSecond;
    tile.rotationSpeed=radians(randomRange(low,rotation.maxDegreesPerSecond,random))*(rotation.randomDirection&&random()<.5?-1:1);
  }
  return tile;
}
// A uniform phase maps to slow face-on motion and a fast edge crossing.
// atan2 keeps both faces continuous through complete turns in either direction.
export function letterYaw(phase,ratio){return Math.atan2(ratio*Math.sin(phase),Math.cos(phase));}
// Leave the easy half unchanged, then smoothly add extra turning at hard peaks.
export function difficultyRotationFactor(level,peak=1){
  const value=Number.isFinite(level)?Math.max(0,Math.min(1,level)):0;
  const hard=Math.max(0,(value-.5)*2),blend=hard*hard*(3-2*hard);
  return value*(1+(peak-1)*blend);
}
function rotate(tile,dt,config,reducedMotion,phaseFactor){
  if(dt<=0)return;
  if(tile.kind!=='hourglass'&&reducedMotion&&config.rotation.respectReducedMotion)return;
  tile.age+=dt;
  if(tile.kind==='hourglass'){
    tile.yaw=(tile.yaw+tile.rotationSpeed*dt)%(Math.PI*2);
  }else{
    tile.spinPhase=(tile.spinPhase+tile.rotationSpeed*phaseFactor*dt)%(Math.PI*2);
    tile.yaw=letterYaw(tile.spinPhase,config.rotation.faceTurnRatio);
  }
}
// Bound the projected thickness as well as the face when tiles turn on X/Y.
export function projectedHalfSize(tile,size,gap=0){
  const pitch=(tile.pitch||0)+(tile.pitchOffset||0),yaw=(tile.yaw||0)+(tile.yawOffset||0);
  const half=size/2,depth=tile.halfDepth||0;
  return {
    x:half*Math.abs(Math.cos(yaw))+depth*Math.abs(Math.sin(yaw))+gap/2,
    y:half*(Math.abs(Math.sin(pitch)*Math.sin(yaw))+Math.abs(Math.cos(pitch)))+depth*Math.abs(Math.sin(pitch)*Math.cos(yaw))+gap/2,
  };
}
function collisionBounds(tile,size,gap){
  const half=projectedHalfSize(tile,size,gap),c=Math.cos(tile.tilt),s=Math.sin(tile.tilt);
  return {x:half.x,y:half.y,c,s,aligned:tile.tilt===0,
    extentX:half.x*Math.abs(c)+half.y*Math.abs(s),
    extentY:half.x*Math.abs(s)+half.y*Math.abs(c),radius:Math.hypot(half.x,half.y)};
}
function contactWithBounds(a,b,ah,bh){
  const dx=b.x-a.x,dy=b.y-a.y;
  // Production tiles turn around Y only, so their projected screen bounds are
  // axis aligned. Keep the same X-first tie break and signed normal as SAT.
  if(ah.aligned&&bh.aligned){
    const overlapX=ah.x+bh.x-Math.abs(dx),overlapY=ah.y+bh.y-Math.abs(dy);
    if(overlapX<=0||overlapY<=0)return null;
    if(overlapX<=overlapY){const sign=dx<0?-1:1;return {penetration:overlapX,nx:sign,ny:ah.s*sign};}
    const sign=dy<0?-1:1;return {penetration:overlapY,nx:-ah.s*sign,ny:sign};
  }
  // Conservative screen-axis rejection avoids generic SAT work on distant
  // tilted pairs. The tiny margin preserves floating-point contact boundaries.
  if(Math.abs(dx)>ah.extentX+bh.extentX+1e-9||Math.abs(dy)>ah.extentY+bh.extentY+1e-9)return null;
  if(dx*dx+dy*dy>(ah.radius+bh.radius)**2)return null;
  const ac=ah.c,as=ah.s,bc=bh.c,bs=bh.s;
  let penetration=Infinity,nx=0,ny=0;
  for(let axis=0;axis<4;axis++){
    const x=axis===0?ac:axis===1?-as:axis===2?bc:-bs;
    const y=axis===0?as:axis===1?ac:axis===2?bs:bc;
    const distance=dx*x+dy*y;
    const ar=ah.x*Math.abs(ac*x+as*y)+ah.y*Math.abs(-as*x+ac*y);
    const br=bh.x*Math.abs(bc*x+bs*y)+bh.y*Math.abs(-bs*x+bc*y);
    const overlap=ar+br-Math.abs(distance);
    if(overlap<=0)return null;
    if(overlap<penetration){penetration=overlap;const sign=distance<0?-1:1;nx=x*sign;ny=y*sign;}
  }
  return {penetration,nx,ny};
}
export function contact(a,b,size,gap=0){
  return contactWithBounds(a,b,collisionBounds(a,size,gap),collisionBounds(b,size,gap));
}
function wall(tile,width,bounds,settings){
  const extent=bounds.extentX+settings.wallPadding;
  if(tile.x<extent){tile.x=extent;tile.vx=Math.max(0,-tile.vx*settings.restitution);}
  if(tile.x>width-extent){tile.x=width-extent;tile.vx=Math.min(0,-tile.vx*settings.restitution);}
}
export function settleTiles(tiles,width,size,settings){
  // Separation changes positions and velocities, never orientation. Reuse each
  // projected shape through all solver iterations instead of rebuilding per pair.
  const bounds=tiles.map(tile=>collisionBounds(tile,size,settings.collisionGap));
  for(let iteration=0;iteration<settings.solverIterations;iteration++){
    let largest=0;
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
      const a=tiles[i],b=tiles[j],hit=contactWithBounds(a,b,bounds[i],bounds[j]);
      if(!hit)continue;
      largest=Math.max(largest,hit.penetration);
      const correction=(hit.penetration+.002)/2;
      a.x-=hit.nx*correction;a.y-=hit.ny*correction;b.x+=hit.nx*correction;b.y+=hit.ny*correction;
      const closing=(b.vx-a.vx)*hit.nx+((b.vy||0)-(a.vy||0))*hit.ny;
      if(closing<0){const impulse=-(1+settings.restitution)*closing/2;a.vx-=hit.nx*impulse;a.vy=(a.vy||0)-hit.ny*impulse;b.vx+=hit.nx*impulse;b.vy=(b.vy||0)+hit.ny*impulse;}
    }
    for(let i=0;i<tiles.length;i++)wall(tiles[i],width,bounds[i],settings);
    if(largest<.005)break;
  }
}
export function stepTiles(tiles,dt,{width,size,speed,config,reducedMotion=false,random=Math.random,difficultyLevel=0}){
  if(dt<=0)return;
  const phaseFactor=difficultyRotationFactor(difficultyLevel,config.difficulty?.peakRotationMultiplier??1);
  const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps,settings=config.physics;
  const recovery=1-Math.exp(-settings.fallRecovery*step),damping=Math.exp(-settings.lateralDamping*step);
  for(let n=0;n<steps;n++){
    for(const tile of tiles){
      const target=speed*(tile.kind==='hourglass'?config.hourglass.speedMultiplier:1);
      if(tile.vy===null||tile.vy===undefined)tile.vy=target;
      tile.vy+=(target-tile.vy)*recovery;
      tile.vx*=damping;
      tile.x+=tile.vx*step;tile.y+=tile.vy*step;
      rotate(tile,step,config,reducedMotion,phaseFactor);
    }
    settleTiles(tiles,width,size,settings);
  }
}
