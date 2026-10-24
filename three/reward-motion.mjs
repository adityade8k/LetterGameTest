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
