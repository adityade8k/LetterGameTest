const test = require('node:test');
const assert = require('node:assert/strict');
const { createConfig } = require('../config.js');
const { rotationSpeed, radians, advanceAngle, hitTile } = require('../motion.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

test('rotation honors both speed bounds and can turn in either direction', () => {
  const { rotation } = createConfig();
  let values = [0, .1];
  near(rotationSpeed(rotation, () => values.shift()), -radians(8));
  values = [1, .9];
  near(rotationSpeed(rotation, () => values.shift()), radians(32));
  values = [.5, .1];
  near(rotationSpeed(rotation, () => values.shift()), -radians(20));
});
test('equal rotation limits give a fixed speed; zero disables rotation', () => {
  const fixed = createConfig({ rotation: { minDegreesPerSecond: 17, maxDegreesPerSecond: 17, randomDirection: false } });
  near(rotationSpeed(fixed.rotation), radians(17));
  const stopped = createConfig({ rotation: { minDegreesPerSecond: 0, maxDegreesPerSecond: 0 } });
  near(rotationSpeed(stopped.rotation), 0);
  near(advanceAngle(.3, rotationSpeed(stopped.rotation), 10), .3);
});
test('rotation is frame-rate independent and bounded over long rounds', () => {
  let angle = .1;
  for (let frame = 0; frame < 60; frame++) angle = advanceAngle(angle, radians(20), 1 / 60);
  near(angle, advanceAngle(.1, radians(20), 1));
  assert.ok(Math.abs(advanceAngle(0, radians(-32), 10000)) < Math.PI * 2);
});
test('hit detection follows the rotated square, including its corners', () => {
  const tile = { x: 100, y: 100, tilt: Math.PI / 4 };
  assert.equal(hitTile(tile, 100, 100, 50), true);
  assert.equal(hitTile(tile, 133, 100, 50), true);
  assert.equal(hitTile(tile, 124, 124, 50), false);
  tile.tilt = 0;
  assert.equal(hitTile(tile, 133, 100, 50), false);
  assert.equal(hitTile(tile, 124, 124, 50), true);
});
test('bad timing and inverted bounds give actionable config errors', () => {
  assert.throws(() => createConfig({ rotation: { minDegreesPerSecond: 40, maxDegreesPerSecond: 10 } }), /rotation.maxDegreesPerSecond/);
  assert.throws(() => createConfig({ falling: { desktopSpawnSeconds: 0 } }), /falling.desktopSpawnSeconds/);
  assert.throws(() => createConfig({ falling: { minPixelsPerSecond: 100 } }), /falling.maxPixelsPerSecond/);
  assert.throws(() => createConfig({ timer: { startSeconds: 100 } }), /timer.maxSeconds/);
  assert.throws(() => createConfig({ rewards: { secondsPerPoint: -1 } }), /rewards.secondsPerPoint/);
  assert.throws(() => createConfig({ rewards: { threeLetterMaxSeconds: -1 } }), /rewards.threeLetterMaxSeconds/);
  assert.throws(() => createConfig({ rewards: { fourLetterMultiplier: NaN } }), /rewards.fourLetterMultiplier/);
});
