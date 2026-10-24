// A fixed population cap and collision-safe incoming positions. No difficulty clock.
export function hasLetterRoom(tiles,limit){
  return tiles.reduce((count,tile)=>count+(tile.kind==='letter'?1:0),0)<limit;
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
