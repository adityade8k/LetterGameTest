const test=require('node:test');
const assert=require('node:assert/strict');
const {createConfig}=require('../config.js');
const {WordGame}=require('../engine.js');
const modulePromise=import('../three/reward-motion.mjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('reward meters refill smoothly while the real clock continues draining',async()=>{
  const {RewardMeters}=await modulePromise,c=createConfig(),m=new RewardMeters(c.celebration);
  m.add(12,8);assert.deepEqual(m.values(42,8),{time:30,score:0});
  let previous=30;
  for(let frame=1;frame<=39;frame++){
    m.advance(1/60);const shown=m.values(42-frame/60,8);
    const credited=shown.time+frame/60;
    assert.ok(credited>=previous);assert.ok(shown.time<=42-frame/60);assert.ok(shown.score<=8);previous=credited;
  }
  near(m.values(41.35,8).time,41.35);assert.equal(m.values(41.35,8).score,8);
});

test('quick consecutive rewards accumulate without a visual jump and reset clears them',async()=>{
  const {RewardMeters}=await modulePromise,m=new RewardMeters(createConfig().celebration);
  m.add(12,8);m.advance(.2);const before=m.values(40,8);
  m.add(6,4);const after=m.values(46,12);near(after.time,before.time);assert.equal(after.score,before.score);
  m.advance(0);assert.deepEqual(m.values(46,12),after);
  m.advance(1);assert.deepEqual(m.values(45,12),{time:45,score:12});
  m.add(5,3);m.reset();assert.deepEqual(m.values(60,0),{time:60,score:0});
});

test('capped rewards animate only credited time, including zero at a full clock',async()=>{
  const {RewardMeters}=await modulePromise,game=new WordGame(['CATCH','SMILE'],{timer:{maxSeconds:120}});game.start(0);
  game.remaining=119;for(const letter of 'CATCH')game.select(letter,0);const first=game.submit(0);
  const m=new RewardMeters(game.config.celebration);m.add(first.reward,first.points);
  assert.equal(first.reward,1);near(m.values(game.remaining,game.score).time,119);
  m.advance(1);near(m.values(game.remaining,game.score).time,120);
  for(const letter of 'SMILE')game.select(letter,0);const second=game.submit(0);
  assert.equal(second.reward,0);m.add(second.reward,second.points);near(m.values(game.remaining,game.score).time,120);
});

test('penalties during a refill never display a negative timer; invalid durations are rejected',async()=>{
  const {RewardMeters}=await modulePromise,m=new RewardMeters(createConfig().celebration);
  m.add(12,8);assert.equal(m.values(2,8).time,0);
  assert.throws(()=>createConfig({celebration:{timerRefillSeconds:0}}),/timerRefillSeconds/);
});

test('score flights withhold each reward until its independent arrival',async()=>{
  const {ScoreFlights}=await modulePromise,flights=new ScoreFlights({durationSeconds:.9});
  const first=flights.add(8);assert.equal(flights.value(8),0);
  flights.advance(.4);const second=flights.add(5);assert.equal(flights.value(13),0);
  flights.advance(.49);assert.equal(flights.value(13),0);
  assert.deepEqual(flights.advance(.01).map(f=>f.id),[first.id]);assert.equal(flights.value(13),8);assert.equal(second.arrived,false);
  flights.retire(first.id);flights.advance(.39);assert.equal(flights.value(13),8);
  assert.deepEqual(flights.advance(.01).map(f=>f.id),[second.id]);assert.equal(flights.value(13),13);
  assert.deepEqual(flights.advance(1),[]);assert.equal(flights.value(13),13);
});

test('score flights freeze, reconcile multiple arrivals and reset without duplicate points',async()=>{
  const {ScoreFlights}=await modulePromise,flights=new ScoreFlights();
  flights.add(7);flights.advance(.2);flights.add(3);flights.advance(0);assert.equal(flights.value(10),0);
  const arrivals=flights.advance(10);assert.equal(arrivals.length,2);assert.equal(flights.value(10),10);
  assert.deepEqual(flights.advance(10),[]);
  flights.add(5);assert.equal(flights.value(15),10);flights.reset();assert.equal(flights.value(15),15);
  assert.equal(flights.add(0),null);assert.equal(flights.add(NaN),null);assert.equal(flights.add(-1),null);
  flights.add(2,{immediate:true});assert.equal(flights.value(17),17);assert.deepEqual(flights.advance(.1),[]);
});

test('flight motion pops at the word, curves toward the score, then arrives precisely',async()=>{
  const {ScoreFlights,scoreFlightPose}=await modulePromise,flights=new ScoreFlights({durationSeconds:.9});
  const flight=flights.add(8),from={x:160,y:521},to={x:232,y:47};
  let pose=scoreFlightPose(flight,from,to);near(pose.x,160);near(pose.y,521);assert.equal(pose.alpha,0);
  flights.advance(.08);pose=scoreFlightPose(flight,from,to);assert.ok(pose.scale>1);assert.ok(pose.y<521);
  flights.advance(.42);pose=scoreFlightPose(flight,from,to);assert.ok(pose.x>160);assert.ok(pose.y<521&&pose.y>47);
  flights.advance(.4);pose=scoreFlightPose(flight,from,to);near(pose.x,232);near(pose.y,47);assert.equal(flight.arrived,true);assert.equal(pose.alpha,0);
  const immediate=flights.add(4,{immediate:true});pose=scoreFlightPose(immediate,from,to,{reducedMotion:true});near(pose.x,to.x);near(pose.y,to.y+19);assert.equal(pose.scale,1);
});
