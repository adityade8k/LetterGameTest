export const clamp01=value=>Math.max(0,Math.min(1,value));
export const easeOut=value=>1-(1-clamp01(value))**3;
// Only presentation lags behind; rules and the actual clock update immediately.
// Pending rewards accumulate, so a second quick word never snaps the meters.
export class RewardMeters {
  constructor(settings){this.settings=settings;this.reset();}
  reset(){this.timeGap=0;this.scoreGap=0;this.timeStart=0;this.scoreStart=0;this.age=0;}
  add(reward,points){
    this.timeStart=this.timeGap+Math.max(0,reward);
    this.scoreStart=this.scoreGap+Math.max(0,points);
    this.timeGap=this.timeStart;this.scoreGap=this.scoreStart;this.age=0;
  }
  advance(dt){
    this.age+=Math.max(0,dt);
    this.timeGap=this.timeStart*(1-easeOut(this.age/this.settings.timerRefillSeconds));
    this.scoreGap=this.scoreStart*(1-easeOut(this.age/this.settings.scoreCountSeconds));
  }
  values(remaining,score){return {time:Math.max(0,remaining-this.timeGap),score:Math.max(0,Math.round(score-this.scoreGap))};}
}

// A presentation-only ledger: each word keeps its own arrival time. The engine
// has already awarded the points; the visible counter withholds pending flights.
export class ScoreFlights {
  constructor({durationSeconds=.9}={}){
    this.durationSeconds=Number.isFinite(durationSeconds)&&durationSeconds>0?Math.max(.2,Math.min(2,durationSeconds)):.9;
    this.reset();
  }
  reset(){this.flights=[];this.nextId=1;}
  add(points,{immediate=false}={}){
    if(!Number.isFinite(points)||points<=0)return null;
    const flight={id:this.nextId++,points,age:0,duration:immediate?0:this.durationSeconds,arrived:immediate};
    this.flights.push(flight);return flight;
  }
  advance(dt){
    const elapsed=Number.isFinite(dt)?Math.max(0,dt):0,arrivals=[];
    for(const flight of this.flights){
      flight.age+=elapsed;
      if(!flight.arrived&&flight.age+1e-9>=flight.duration){flight.arrived=true;arrivals.push(flight);}
    }
    return arrivals;
  }
  retire(id){this.flights=this.flights.filter(flight=>flight.id!==id);}
  get pendingPoints(){return this.flights.reduce((sum,flight)=>sum+(flight.arrived?0:flight.points),0);}
  value(score){return Math.max(0,score-this.pendingPoints);}
}

export function scoreFlightPose(flight,from,to,{reducedMotion=false,lane=0}={}){
  if(reducedMotion||flight.duration===0)return {x:to.x,y:to.y+19,scale:1,alpha:1-clamp01(flight.age/.35)};
  const popSeconds=Math.min(.13,flight.duration*.2),pop=clamp01(flight.age/popSeconds);
  const travel=clamp01((flight.age-popSeconds)/(flight.duration-popSeconds));
  const t=travel*travel*(3-2*travel),one=1-t;
  const control={x:Math.min(313,Math.max(from.x,to.x)+74+lane*13),y:from.y-(from.y-to.y)*.5};
  const x=one*one*from.x+2*one*t*control.x+t*t*to.x;
  const y=one*one*from.y+2*one*t*control.y+t*t*to.y-5*Math.sin(pop*Math.PI)*(1-t);
  const scale=(.82+.18*pop+.12*Math.sin(pop*Math.PI))*(1-.16*t);
  const alpha=clamp01(pop/.22)*(1-clamp01((travel-.94)/.06));
  return {x,y,scale,alpha};
}
