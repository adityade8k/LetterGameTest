const test = require('node:test');
const assert = require('node:assert/strict');
const { WordGame } = require('../engine.js');
const { createConfig } = require('../config.js');
const { hourglassPosition, smokePatches, smokeEnvelope, smokePose } = require('../effects.js');
const dictionary = require('../data/words.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const create = (options, random = () => 0) => { const game = new WordGame(dictionary, {specialTiles:{warmupSeconds:0}, ...options}, random); game.start(0); return game; };
const spell = (game, word, now = 0, goldIndices = []) => [...word].map((letter, index) => game.select(letter, now, { bonus: goldIndices.includes(index) })).at(-1);

test('hourglass runs for 7.5 unscaled seconds and slows the clock to 40 percent', () => {
  const game = create();
  assert.equal(game.activate('hourglass', 0).duration, 7.5);
  assert.equal(game.timeScale, .4);
  game.advance(2000);
  near(game.remaining, 59.2);
  near(game.effects.hourglass, 5.5);
  game.advance(7500);
  near(game.remaining, 57);
  assert.equal(game.effects.hourglass, 0);
  assert.equal(game.timeScale, 1);
  game.advance(8500);
  near(game.remaining, 56);
});
test('a frame crossing effect expiry drains both slow and normal time accurately', () => {
  const game = create(); game.activate('hourglass', 0); game.advance(8000);
  near(game.remaining, 56.5);
  near(game.elapsed, 8);
  assert.equal(game.effects.hourglass, 0);
});
test('smoke expires after five active seconds while ice lasts 7.5 seconds when combined', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0);
  game.advance(4000);
  near(game.effects.smoke, 1);
  near(game.effects.hourglass, 3.5);
  game.advance(5000);
  assert.deepEqual(game.effects, { hourglass: 2.5, smoke: 0, fire: 0 });
  near(game.remaining, 58);
  game.advance(7500);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0, fire: 0 });
  near(game.remaining, 57);
});
test('pause freezes both effects; resume uses only active time', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0);
  game.pause(2000); game.advance(100000);
  assert.equal(game.activate('smoke', 100000).type, 'ignored');
  near(game.effects.hourglass, 5.5); near(game.effects.smoke, 3);
  game.resume(100000); game.advance(103000);
  assert.deepEqual(game.effects, { hourglass: 2.5, smoke: 0, fire: 0 });
  near(game.remaining, 58);
  near(game.elapsed, 5);
  game.advance(105500);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0, fire: 0 });
  near(game.remaining, 57);near(game.elapsed, 7.5);
});
test('a second pickup refreshes duration instead of stacking speed multipliers', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('hourglass', 4000);
  assert.equal(game.effects.hourglass, 7.5);
  assert.equal(game.timeScale, .4);
  game.advance(11500);
  near(game.remaining, 55.4);
  assert.equal(game.timeScale, 1);
});
test('effects preserve the pending word, bonus letters and points', () => {
  const game = create(); spell(game, 'CAT', 1000, [0]);
  const before = game.pendingReward;
  game.activate('hourglass', 1000); game.activate('smoke', 1000);
  assert.equal(game.current, 'CAT');
  assert.equal(game.pendingReward, before);
  assert.equal(game.score, 0);
  assert.equal(game.wordCount, 0);
});
test('slow time does not reduce fixed penalties', () => {
  const game = create(); game.activate('hourglass', 0);
  spell(game, 'CAT', 1000); game.undo(1000);
  near(game.remaining, 57.6);
  assert.equal(game.effects.hourglass, 6.5);
});
test('late pickups cannot revive an expired game and effects clear on game over', () => {
  const late = create();
  assert.equal(late.activate('hourglass', 60001).type, 'ended');
  assert.deepEqual(late.effects, { hourglass: 0, smoke: 0, fire: 0 });
  const active = create();
  active.activate('hourglass', 59000); active.activate('smoke', 59000);
  active.advance(61500);
  assert.equal(active.phase, 'over');
  assert.equal(active.remaining, 0);
  assert.deepEqual(active.effects, { hourglass: 0, smoke: 0, fire: 0 });
});
test('gold C in CATCH doubles twelve points to twenty-four while preserving 14.4 seconds', () => {
  const game = create(); spell(game, 'CATCH', 30000, [0]);
  near(game.pendingReward, 14.4);assert.equal(game.pendingBasePoints,12);assert.equal(game.pendingPoints,24);
  assert.equal(game.hasBonus, true);
  const result = game.submit(30000);
  assert.equal(result.points, 24);assert.equal(result.basePoints,12);assert.equal(result.bonusPoints,12);assert.equal(result.scoreMultiplier,2);
  near(result.bonusReward, 0);
  near(result.reward, 14.4);
  near(game.remaining, 44.4);
  assert.equal(game.score, 24);assert.equal(game.collectedPoints('CATCH'),24);
  assert.equal(game.hasBonus, false);
  assert.equal(game.pendingScoreMultiplier,1);
  assert.deepEqual(game.currentTiles, []);
});
test('multiple gold letters double the word only once, without increasing its time reward', () => {
  const game = create(); spell(game, 'CATCH', 30000, [0, 2]);
  near(game.pendingReward, 14.4);
  const result=game.submit(30000);assert.equal(result.points,24);assert.equal(result.scoreMultiplier,2);
});
test('gold score multipliers and independent reward rates are configurable; the timer cap still applies', () => {
  const game = create({ timer: {maxSeconds:60}, bonusLetters: { scoreMultiplier: 3 }, rewards: { secondsPerPoint: .5 } });
  spell(game, 'CATCH', 1000, [0]);
  const result = game.submit(1000);
  near(result.requestedReward, 7.2);
  assert.equal(result.reward, 1);
  assert.equal(result.points, 36);assert.equal(result.scoreMultiplier,3);
  assert.equal(game.remaining, 60);
  for(const scoreMultiplier of [0,1,-1,NaN,Infinity])assert.throws(()=>createConfig({bonusLetters:{scoreMultiplier}}),/scoreMultiplier/);
});
test('gold doubles short-word scores and retains their ordinary time caps and no pickup drops', () => {
  for (const [word, gold, expected] of [
    ['CAT',[0],.5], ['CAT',[0,1,2],.5], ['SUN',[0],.3],
    ['QUIZ',[0],2], ['QUIZ',[0,3],2], ['QUIZ',[0,1,2,3],2],
    ['ZAX',[0,1,2],.5], ['JAZZ',[0,1,2,3],2],
  ]) {
    const game = create(); spell(game, word, 30000, gold);
    near(game.pendingReward, expected);
    const result = game.submit(30000);
    near(result.reward, expected);
    near(result.bonusReward, expected - game.rewardFor(word));
    assert.equal(result.points, game.pointsFor(word)*2);
    assert.equal(game.score, game.pointsFor(word)*2);
    assert.equal(result.hourglassOffered, false);
  }
});
test('short-word time rewards retain configurable rates independently of gold score', () => {
  const game = create({
    timer: {maxSeconds:60},
    bonusLetters: {scoreMultiplier: 3},
    rewards: {secondsPerPoint: 2, threeLetterMultiplier: .2, threeLetterMaxSeconds: .25},
  });
  spell(game, 'CAT', 1000, [0]);
  const result = game.submit(1000);
  near(result.requestedReward, .25);
  near(result.bonusReward, 0);
  assert.equal(result.reward, .25);
  assert.equal(game.remaining, 59.25);
  assert.equal(result.points, 15);
});
test('clearing, misspelling and repeating gold words never grants extra time or points', () => {
  const game = create();
  spell(game, 'CAT', 0, [0]); game.undo(0);
  assert.equal(game.pendingReward, 0);
  spell(game, 'CATQ', 0, [0]);
  assert.equal(game.pendingReward, 0);
  spell(game, 'CAT'); game.submit(0);
  const before = game.remaining;
  spell(game, 'CAT', 0, [0, 1, 2]);
  assert.equal(game.submit(0).reason, 'repeat');
  assert.equal(game.remaining, before);
  assert.equal(game.score, 5);
  assert.equal(game.pendingReward, 0);
});
test('restart clears effects and bonus metadata', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0); spell(game, 'CAT', 0, [0]);
  game.start(10000);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0, fire: 0 });
  assert.deepEqual(game.currentTiles, []);
  assert.equal(game.pendingReward, 0);
  assert.equal(game.timeScale, 1);
});
test('hourglasses enter above the top at a random horizontal position away from other tiles', () => {
  const first = hourglassPosition(390, 47, [], () => 0);
  const second = hourglassPosition(390, 47, [], () => 1);
  assert.notEqual(first.x, second.x);
  for (const position of [first, second]) {
    assert.ok(position.x > 23.5 && position.x < 366.5);
    assert.equal(position.y, -47);
  }
  let values = [.5, 0];
  const open = hourglassPosition(390, 47, [{x:195,y:-47}], () => values.shift() ?? 0);
  assert.ok(Math.abs(open.x-195) > 47);
});
test('legacy grenade flags never add smoke to letters or change their gold rewards', () => {
  const game = create({timer:{maxSeconds:120}});
  const result = game.select('C', 20000, {grenade:true, bonus:true});
  assert.equal(result.smokeTriggered, undefined);
  assert.equal(game.current, 'C');assert.equal(game.effects.smoke, 0);
  assert.equal(game.currentTiles[0].grenade, false);
  spell(game, 'ATCH', 20000);const word = game.submit(20000);
  assert.equal(word.points, 24);near(word.requestedReward, 14.4);
  assert.equal(game.effects.smoke, 0);
});
test('misspellings and blanks cannot activate or refresh smoke from old letter flags', () => {
  const game = create();game.activate('smoke',0);
  game.select('C',1000,{grenade:true});game.select('A',1500,{grenade:true});game.select('T',1500);
  assert.equal(game.select('Q',1500,{grenade:true}).smokeTriggered,undefined);
  assert.equal(game.current,'');near(game.effects.smoke,3.5);
  game.select('?',2000,{grenade:true});near(game.effects.smoke,3);
  assert.equal(game.currentTiles[0].grenade,false);
});
const seededRandom = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
test('smoke uses varied sizes, silhouettes and spaced in-field anchors', () => {
  const settings = createConfig().smoke;
  for (const [width,height] of [[360,780],[390,500],[900,640]]) {
    const short = Math.min(width,height);
    for (let seed=1;seed<=30;seed++) {
      const patches = smokePatches(width,height,settings,seededRandom(seed));
      assert.deepEqual(patches,smokePatches(width,height,settings,seededRandom(seed)));
      assert.equal(patches.length,4);
      assert.ok(patches.every(p=>p.x>=.14&&p.x<=.86&&p.y>=.20&&p.y<=.74));
      for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++)
        assert.ok(Math.hypot((patches[i].x-patches[j].x)*width/short,(patches[i].y-patches[j].y)*height/short)>.25);
      const radii=patches.map(p=>p.radius);
      assert.ok(radii.every(radius=>radius>=settings.radiusFraction*.64&&radius<settings.radiusFraction*1.34));
      assert.ok(Math.max(...radii)/Math.min(...radii)>1.4);
      for(const key of ['seed','phase','aspect']) assert.equal(new Set(patches.map(p=>p[key])).size,4);
      assert.ok(patches.every(p=>p.aspect>=.73&&p.aspect<1.35));
      assert.notDeepEqual(patches,smokePatches(width,height,settings,seededRandom(seed+1)));
    }
  }
});
test('invalid effect settings are rejected before a round starts', () => {
  assert.throws(() => createConfig({ hourglass: { timeScale: 0 } }), /hourglass.timeScale/);
  assert.throws(() => createConfig({ hourglass: { timeScale: 1 } }), /hourglass.timeScale/);
  assert.throws(() => createConfig({ bonusLetters: { chance: 2 } }), /bonusLetters.chance/);
  for(const rotationDegreesPerSecond of [0,-1,Infinity,NaN])assert.throws(() => createConfig({hourglass:{rotationDegreesPerSecond}}), /rotationDegreesPerSecond/);
  assert.throws(() => createConfig({ hourglass: { spawnChance: 2 } }), /hourglass.spawnChance/);
  assert.throws(() => createConfig({ hourglass: { minWordLength: 0 } }), /hourglass.minWordLength/);
  assert.throws(() => createConfig({ hourglass: { speedMultiplier: 1 } }), /hourglass.speedMultiplier/);
});


test('pink smoke fades smoothly, holds an opaque center, and ends on time',()=>{
 const s=createConfig().smoke;
 near(smokeEnvelope(0,5,s),0);near(smokeEnvelope(s.fadeInSeconds/2,5-s.fadeInSeconds/2,s),.5);
 near(smokeEnvelope(1,4,s),1);near(smokeEnvelope(3,2,s),1);
 near(smokeEnvelope(5-s.fadeOutSeconds/2,s.fadeOutSeconds/2,s),.5);near(smokeEnvelope(5,0,s),0);
 near(smokeEnvelope(.1,4.9,s,.12),0);
 assert.throws(()=>createConfig({smoke:{fadeInSeconds:4,fadeOutSeconds:2}}));
 assert.throws(()=>createConfig({smoke:{driftPixelsPerSecond:-1}}));
});

test('smoke forms and dissolves at its anchor with only a few pixels of drift',()=>{
  const s=createConfig().smoke;
  for(const [width,height] of [[360,780],[900,640]]){
    const patches=smokePatches(width,height,s,seededRandom(36));
    for(const patch of patches){
      const start=smokePose(patch,0,5,width,height,s),middle=smokePose(patch,2,3,width,height,s),end=smokePose(patch,5,0,width,height,s);
      near(start.x,patch.x*width);near(start.y,patch.y*height);assert.equal(start.opacity,0);
      assert.ok(middle.x>0&&middle.x<width&&middle.y>0&&middle.y<height);assert.equal(middle.opacity,1);
      assert.equal(end.opacity,0);
      for(let tick=0;tick<=50;tick++){
        const age=tick/10,remaining=5-age;
        for(const driftPixelsPerSecond of [0,s.driftPixelsPerSecond,1000]){
          const settings={...s,driftPixelsPerSecond};
          const pose=smokePose(patch,age,remaining,width,height,settings);
          assert.ok(Math.hypot(pose.x-patch.x*width,pose.y-patch.y*height)<5);
          near(pose.diameter,start.diameter);
          near(pose.opacity,smokeEnvelope(age,remaining,s,patch.delay));
          const reduced=smokePose(patch,age,remaining,width,height,settings,true);
          near(reduced.x,patch.x*width);near(reduced.y,patch.y*height);
          near(reduced.opacity,pose.opacity);near(reduced.diameter,pose.diameter);
          if(driftPixelsPerSecond===0){near(pose.x,reduced.x);near(pose.y,reduced.y);}
        }
      }
    }
  }
});

test('anchored smoke freezes during pause and still dissolves on active time with hourglass',()=>{
  const game=create(),s=createConfig().smoke;
  const patch=smokePatches(390,500,s,seededRandom(12))[0];
  const pose=()=>smokePose(patch,s.durationSeconds-game.effects.smoke,game.effects.smoke,390,500,s);
  game.activate('hourglass',0);game.activate('smoke',0);
  game.pause(2000);
  const frozen=pose();
  game.advance(100000);assert.deepEqual(pose(),frozen);assert.equal(frozen.opacity,1);
  game.resume(100000);game.advance(102400);
  near(game.effects.smoke,.6);near(pose().opacity,.5);
  game.advance(103000);near(game.effects.smoke,0);near(pose().opacity,0);
});
