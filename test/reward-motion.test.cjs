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
  const {RewardMeters}=await modulePromise,game=new WordGame(['CATCH','SMILE']);game.start(0);
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
