// Fit a burst once, using tiny CPU alpha masks captured while its atlas loads.
// No GPU reads or coverage calculations happen during the animation.
export function fitSmokeCoverage(patches,alphaMasks,layout,bands,target=.65){
  if(!patches?.length||!alphaMasks?.length||!(layout?.width>0)||!(layout?.height>0)||!Number.isFinite(target))return 1;
  const height=layout.height;
  const top=bands?.topSolid??0,bottom=bands?.bottomSolid??height;
  const topClear=bands?.topClear??top,bottomClear=bands?.bottomClear??bottom;
  if(!Number.isFinite(top)||!Number.isFinite(bottom)||bottom<=top)return 1;
  const columns=32,rows=40,total=columns*rows;
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const prepared=[];
  let hasInk=false;
  for(const patch of patches){
    const mask=alphaMasks[patch.variant],size=mask?.size,data=mask?.data;
    if(!Number.isInteger(size)||size<1||!data||data.length!==size*size||!(patch.width>0)||!(patch.height>0)||!Number.isFinite(patch.x)||!Number.isFinite(patch.y))return 1;
    if(!hasInk)hasInk=data.some(alpha=>alpha>0);
    const left=new Int16Array(columns),right=new Int16Array(columns),mix=new Float64Array(columns);
    for(let column=0;column<columns;column++){
      const u=((column+.5)/columns-patch.x)/patch.width+.5;
      if(u<0||u>1){left[column]=-1;continue;}
      const texel=Math.max(0,Math.min(size-1,u*size-.5));
      left[column]=Math.floor(texel);right[column]=Math.min(size-1,left[column]+1);mix[column]=texel-left[column];
    }
    prepared.push({size,data,left,right,mix,y:patch.y*height,height:patch.height*height});
  }
  if(!hasInk)return 1;
  const rowY=new Float64Array(rows),remainingLimit=new Float64Array(rows);
  for(let row=0;row<rows;row++){
    const y=top+(row+.5)*(bottom-top)/rows;
    const topVisibility=topClear>top?smooth((y-top)/(topClear-top)):1;
    const bottomVisibility=bottom>bottomClear?smooth((bottom-y)/(bottom-bottomClear)):1;
    // The field veil's opacity is max(topVeil,bottomVeil), hence min visibility.
    const visible=Math.min(topVisibility,bottomVisibility);
    rowY[row]=y;remainingLimit[row]=visible>=.5?1-.5/visible:-1;
  }
  const lowerRows=new Int32Array(prepared.length),upperRows=new Int32Array(prepared.length),rowMix=new Float64Array(prepared.length);
  function coverage(scale){
    let covered=0;
    for(let row=0;row<rows;row++){
      const limit=remainingLimit[row];if(limit<0)continue;
      for(let index=0;index<prepared.length;index++){
        const patch=prepared[index],v=.5-(rowY[row]-patch.y)/(patch.height*scale);
        if(v<0||v>1){lowerRows[index]=-1;continue;}
        // WebGL readback rows run bottom-to-top; game coordinates run downward.
        const texel=Math.max(0,Math.min(patch.size-1,v*patch.size-.5)),lower=Math.floor(texel);
        lowerRows[index]=lower*patch.size;upperRows[index]=Math.min(patch.size-1,lower+1)*patch.size;rowMix[index]=texel-lower;
      }
      for(let column=0;column<columns;column++){
        let remaining=1;
        for(let index=0;index<prepared.length;index++){
          const patch=prepared[index],left=patch.left[column],lower=lowerRows[index];
          if(left<0||lower<0)continue;
          const right=patch.right[column],upper=upperRows[index],tx=patch.mix[column],data=patch.data;
          const a=data[lower+left]+(data[lower+right]-data[lower+left])*tx;
          const b=data[upper+left]+(data[upper+right]-data[upper+left])*tx;
          const alpha=(a+(b-a)*rowMix[index])/255;
          remaining*=1-alpha;
          if(remaining<=limit){covered++;break;}
        }
      }
    }
    return covered/total;
  }
  target=Math.max(0,Math.min(1,target));
  const initialCoverage=coverage(1);
  let best=1,bestError=Math.abs(initialCoverage-target);
  const consider=(scale,value)=>{
    const error=Math.abs(value-target);
    if(error<bestError||error===bestError&&Math.abs(scale-1)<Math.abs(best-1)){
      best=scale;bestError=error;
    }
  };
  // A small coarse scan finds a useful bracket even with irregular masks whose
  // sampled coverage is not strictly monotonic. Every loop has a fixed bound.
  const scales=[.65,.85,1,1.2,1.4,1.6,1.8];
  let previousScale=scales[0],previousCoverage=coverage(previousScale);
  consider(previousScale,previousCoverage);
  let low=0,high=0,lowCoverage=0,bracketDistance=Infinity,maxCoverage=Math.max(previousCoverage,initialCoverage);
  for(let index=1;index<scales.length;index++){
    const scale=scales[index],value=scale===1?initialCoverage:coverage(scale);
    consider(scale,value);maxCoverage=Math.max(maxCoverage,value);
    if((previousCoverage-target)*(value-target)<=0&&previousCoverage!==value){
      const distance=Math.abs((scale+previousScale)/2-1);
      if(distance<bracketDistance){low=previousScale;high=scale;lowCoverage=previousCoverage;bracketDistance=distance;}
    }
    previousScale=scale;previousCoverage=value;
  }
  if(maxCoverage===0)return 1;
  if(high>low)for(let iteration=0;iteration<8;iteration++){
    const middle=(low+high)/2,value=coverage(middle);consider(middle,value);
    if((lowCoverage-target)*(value-target)<=0)high=middle;
    else{low=middle;lowCoverage=value;}
  }
  return best;
}
