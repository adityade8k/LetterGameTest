// The world fills the fixed portrait canvas; CSS centers that canvas in the viewport.
export function viewportLayout(pixelWidth,pixelHeight,safeTop=0,safeBottom=0){
  const scale=Math.max(.01,Math.min(pixelWidth/360,(pixelHeight-safeTop-safeBottom)/640));
  const width=pixelWidth/scale,height=pixelHeight/scale,left=(width-360)/2;
  const top=safeTop/scale,bottom=safeBottom/scale;
  const panels=[{x:left+12,y:top+10,w:336,h:103},{x:left+12,y:height-bottom-170,w:336,h:155}];
  return {width,height,left,top,bottom,panels,visibleArea:width*height-panels.reduce((sum,p)=>sum+p.w*p.h,0)};
}
export function overlapsPanel(x,y,layout,margin=0){
  return layout.panels.some(p=>x>p.x-margin&&x<p.x+p.w+margin&&y>p.y-margin&&y<p.y+p.h+margin);
}
export function exposedPosition(x,y,layout,margin=0){
  return x>=margin&&x<=layout.width-margin&&y>=margin&&y<=layout.height-margin&&!overlapsPanel(x,y,layout,margin);
}
export function letterTarget(layout,config){
  return Math.min(config.falling.maxVisibleLetters,Math.max(config.falling.visibleLetterTarget,
    Math.round(config.falling.visibleLetterTarget*layout.visibleArea/(360*440))));
}
