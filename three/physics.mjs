// Screen-plane oriented-box contacts, in the same logical units as the game.
// No global clock or browser dependency: effects and pause supply scaled dt.
const radians = n => n * Math.PI / 180;
const randomRange = (min,max,random) => min+(max-min)*random();
export function prepareTile(tile,config,random=Math.random){
  const rotation=config.rotation,high=(config.letterPoints[tile.letter]||0)>=rotation.highValueMinPoints;
  tile.vx=0;tile.vy=null;tile.age=0;tile.baseTilt=tile.tilt;
  // Y remains dominant on valuable letters, with a different 3D tumble per tile.
  tile.turnAxis=high?'y':'z';tile.yaw=0;tile.pitch=0;
  tile.rockPhase=random()*Math.PI*2;
  tile.spins=tile.kind==='hourglass'||random()<(high?rotation.highValueSpinChance:rotation.ordinarySpinChance);
  // High-value tiles use the upper half of the same user-controlled speed range.
  const low=high?(rotation.minDegreesPerSecond+rotation.maxDegreesPerSecond)/2:rotation.minDegreesPerSecond;
  tile.rotationSpeed=radians(randomRange(low,rotation.maxDegreesPerSecond,random))*(rotation.randomDirection&&random()<.5?-1:1);
  tile.rest=randomRange(rotation.restMinSeconds,rotation.restMaxSeconds,random);
  tile.turnLeft=radians(randomRange(150,240,random));
  const secondary=()=>rotation.secondaryAxisWeight*randomRange(.65,1,random)*(random()<.5?-1:1);
  tile.turnAxes={x:secondary(),y:high?1:secondary(),z:high?secondary():1};
  const length=Math.hypot(...Object.values(tile.turnAxes));
  for(const axis of ['x','y','z'])tile.turnAxes[axis]/=length;
  return tile;
}
function rotate(tile,dt,config,reducedMotion,random){
  if(reducedMotion&&config.rotation.respectReducedMotion)return;
  if(!config.rotation.maxDegreesPerSecond)return;
  tile.age+=dt;
  if(!tile.spins){
    const amplitude=Math.min(config.rotation.rockDegrees,config.rotation.maxDegreesPerSecond/1.4);
    tile.tilt=tile.baseTilt+radians(amplitude)*(Math.sin(tile.age*.49+tile.rockPhase)-Math.sin(tile.rockPhase));
    return;
  }
  if(tile.rest>0){tile.rest=Math.max(0,tile.rest-dt);return;}
  const amount=Math.min(tile.turnLeft,Math.abs(tile.rotationSpeed)*dt);
  const signedAmount=Math.sign(tile.rotationSpeed)*amount;
  tile.pitch=(tile.pitch+tile.turnAxes.x*signedAmount)%(Math.PI*2);
  tile.yaw=(tile.yaw+tile.turnAxes.y*signedAmount)%(Math.PI*2);
  tile.tilt=(tile.tilt+tile.turnAxes.z*signedAmount)%(Math.PI*2);
  tile.turnLeft-=amount;
  if(tile.turnLeft<=1e-9){
    tile.rest=randomRange(config.rotation.restMinSeconds,config.rotation.restMaxSeconds,random);
    tile.turnLeft=radians(randomRange(150,240,random));
    if(config.rotation.randomDirection&&random()<.35)tile.rotationSpeed*=-1;
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
export function contact(a,b,size,gap=0){
  const ah=projectedHalfSize(a,size,gap),bh=projectedHalfSize(b,size,gap),dx=b.x-a.x,dy=b.y-a.y;
  if(dx*dx+dy*dy>(Math.hypot(ah.x,ah.y)+Math.hypot(bh.x,bh.y))**2)return null;
  const ac=Math.cos(a.tilt),as=Math.sin(a.tilt),bc=Math.cos(b.tilt),bs=Math.sin(b.tilt);
  const axes=[[ac,as],[-as,ac],[bc,bs],[-bs,bc]];
  let penetration=Infinity,nx=0,ny=0;
  for(const [x,y] of axes){
    const distance=dx*x+dy*y;
    const ar=ah.x*Math.abs(ac*x+as*y)+ah.y*Math.abs(-as*x+ac*y);
    const br=bh.x*Math.abs(bc*x+bs*y)+bh.y*Math.abs(-bs*x+bc*y);
    const overlap=ar+br-Math.abs(distance);
    if(overlap<=0)return null;
    if(overlap<penetration){penetration=overlap;const sign=distance<0?-1:1;nx=x*sign;ny=y*sign;}
  }
  return {penetration,nx,ny};
}
function wall(tile,width,size,settings){
  const half=projectedHalfSize(tile,size,settings.collisionGap);
  const extent=half.x*Math.abs(Math.cos(tile.tilt))+half.y*Math.abs(Math.sin(tile.tilt))+settings.wallPadding;
  if(tile.x<extent){tile.x=extent;tile.vx=Math.max(0,-tile.vx*settings.restitution);}
  if(tile.x>width-extent){tile.x=width-extent;tile.vx=Math.min(0,-tile.vx*settings.restitution);}
}
export function settleTiles(tiles,width,size,settings){
  for(let iteration=0;iteration<settings.solverIterations;iteration++){
    let largest=0;
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
      const a=tiles[i],b=tiles[j],hit=contact(a,b,size,settings.collisionGap);
      if(!hit)continue;
      largest=Math.max(largest,hit.penetration);
      const correction=(hit.penetration+.002)/2;
      a.x-=hit.nx*correction;a.y-=hit.ny*correction;b.x+=hit.nx*correction;b.y+=hit.ny*correction;
      const closing=(b.vx-a.vx)*hit.nx+((b.vy||0)-(a.vy||0))*hit.ny;
      if(closing<0){const impulse=-(1+settings.restitution)*closing/2;a.vx-=hit.nx*impulse;a.vy=(a.vy||0)-hit.ny*impulse;b.vx+=hit.nx*impulse;b.vy=(b.vy||0)+hit.ny*impulse;}
    }
    for(const tile of tiles)wall(tile,width,size,settings);
    if(largest<.005)break;
  }
}
export function stepTiles(tiles,dt,{width,size,speed,config,reducedMotion=false,random=Math.random}){
  if(dt<=0)return;
  const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps,settings=config.physics;
  for(let n=0;n<steps;n++){
    for(const tile of tiles){
      const target=speed*(tile.kind==='hourglass'?config.hourglass.speedMultiplier:tile.grenade?config.smoke.letterSpeedMultiplier:1);
      if(tile.vy===null||tile.vy===undefined)tile.vy=target;
      tile.vy+=(target-tile.vy)*(1-Math.exp(-settings.fallRecovery*step));
      tile.vx*=Math.exp(-settings.lateralDamping*step);
      tile.x+=tile.vx*step;tile.y+=tile.vy*step;
      rotate(tile,step,config,reducedMotion,random);
    }
    settleTiles(tiles,width,size,settings);
  }
}
