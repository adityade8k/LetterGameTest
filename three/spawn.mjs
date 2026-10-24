import { exposedPosition, letterTarget } from './layout.mjs';
// Keep one pick unfilled. Later picks release replacements through the top edge.
export class DeferredRefills {
  constructor(){this.reset();}
  reset(){this.pending=0;}
  picked(){this.pending++;}
  budget(visible,target,afterPick=false){
    const ready=Math.max(0,this.pending-1);
    if(afterPick)return Math.min(1,ready);
    // Periodic density maintenance must also leave the newest pick unfilled.
    return Math.min(2,Math.max(ready,target-Math.min(1,this.pending)-visible));
  }
  placed(){if(this.pending>1)this.pending--;}
}

// Only scored words in this round advance supply. At full density these are
// exactly the existing targets, interval and travel budget.
export function supplyProfile(layout,size,config,wordCount=0){
  const progress=Math.min(1,Math.max(0,wordCount)/config.density.wordsToFull);
  const fraction=config.density.startFraction+(1-config.density.startFraction)*progress;
  const fullTarget=Math.max(config.opening.mobileTiles,letterTarget(layout,config));
  return {
    fraction,
    target:Math.min(fullTarget,Math.max(7+config.wildcards.openingTiles,Math.round(fullTarget*fraction))),
    limit:Math.max(1,Math.floor(streamLimit(layout,size,config)*fraction)),
    spawnSeconds:config.falling.mobileSpawnSeconds/fraction
  };
}

// Collision-safe incoming and replacement positions.
export function hasLetterRoom(tiles,limit){
  return tiles.reduce((count,tile)=>count+(tile.kind==='letter'?1:0),0)<limit;
}
// Scattered positions are used only for the opening board.
export function fieldPosition(tiles,layout,size,random=Math.random){
  const margin=size/Math.SQRT2+5,clearance=size*1.4;
  const candidates=[];
  for(let i=0;i<100;i++)candidates.push({x:margin+random()*(layout.width-2*margin),y:margin+random()*(layout.height-2*margin)});
  // A randomized grid fallback finds a genuine gap on crowded boards.
  const grid=[];
  for(let y=margin;y<=layout.height-margin;y+=size*1.4)for(let x=margin;x<=layout.width-margin;x+=size*1.4)grid.push({x,y});
  const offset=Math.floor(random()*Math.max(1,grid.length));
  candidates.push(...grid.slice(offset),...grid.slice(0,offset));
  let best=null,bestDistance=-1;
  for(const point of candidates){
    if(!exposedPosition(point.x,point.y,layout,margin))continue;
    const distance=tiles.reduce((nearest,tile)=>Math.min(nearest,Math.hypot(point.x-tile.x,point.y-tile.y)),Infinity);
    if(distance>=clearance)return point;
    if(distance>bestDistance){best=point;bestDistance=distance;}
  }
  // The soft solver can nudge a slightly tighter opening gap.
  return bestDistance>=size*1.08?best:null;
}
// Include the travel hidden behind both panels in the population budget. A cap
// based only on exposed choices stops arrivals before outgoing tiles leave.
export function streamLimit(layout,size,config){
  const columns=Math.max(1,Math.floor(layout.width/(size+config.tiles.gapPixels)));
  return Math.max(config.falling.letterLimit,columns*Math.ceil((layout.height+size*2)/(size*1.45)));
}
// At round start, continue the opening board back through the header to the
// top entrance. Independent column phases avoid a second synchronized wave.
export function openingFeed(tiles,layout,size,config,random=Math.random,density=1){
  const columns=Math.max(1,Math.floor(layout.width/(size+config.tiles.gapPixels)));
  const spacing=size*1.45/density,positions=[];
  const firstPanel=layout.panels[0],bottom=firstPanel.y+firstPanel.h+size*.6;
  for(let column=0;column<columns;column++){
    const x=(column+.5)*layout.width/columns+(random()-.5)*8;
    for(let y=bottom-random()*spacing;y>=-size;y-=spacing){
      if([...tiles,...positions].every(tile=>Math.hypot(tile.x-x,tile.y-y)>=spacing))positions.push({x,y});
    }
  }
  return positions;
}
export function spawnPosition(tiles,width,size,config,random=Math.random){
  if(!hasLetterRoom(tiles,config.falling.letterLimit))return null;
  const columns=Math.max(1,Math.floor(width/(size+config.tiles.gapPixels)));
  const available=[];
  for(let column=0;column<columns;column++){
    const x=(column+.5)*width/columns,y=-size;
    // A full diagonal of clearance fits the bevel and all entry tilts, without
    // reserving the old 127-pixel vertical corridor for every new letter.
    if(tiles.every(tile=>Math.hypot(tile.x-x,tile.y-y)>=size*1.45))available.push({x,y});
  }
  return available.length?available[Math.min(available.length-1,Math.floor(random()*available.length))]:null;
}
