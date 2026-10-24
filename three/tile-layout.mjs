// Face zones are intentionally disjoint, including the widest W and M.
// All dimensions scale with the tile rather than relying on font guesses.
export function tileLayout(size=47){
 const scale=size/47;
 return Object.fromEntries(Object.entries({
  letter:{x:-.5,y:-1,w:29,h:22},
  points:{x:15,y:-17,w:8,h:5.5},
  bonus:{x:-12,y:16.5,w:14,h:6},
  grenade:{x:13.5,y:17,w:9,h:9},
 }).map(([name,rect])=>[name,Object.fromEntries(Object.entries(rect).map(([k,v])=>[k,v*scale]))]));
}
export function fitFaceObject(bounds,zone){
 const scale=Math.min(zone.w/Math.max(.001,bounds.width),zone.h/Math.max(.001,bounds.height));
 return {scale,x:zone.x-bounds.centerX*scale,y:zone.y-bounds.centerY*scale};
}
