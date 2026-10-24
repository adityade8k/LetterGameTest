/* Rotation helpers shared by the p5 sketch and tests. Angles use radians. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterfallMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const radians = degrees => degrees * Math.PI / 180;
  function rotationSpeed(rotation, random = Math.random) {
    const magnitude = rotation.minDegreesPerSecond + random() * (rotation.maxDegreesPerSecond - rotation.minDegreesPerSecond);
    const direction = rotation.randomDirection && random() < .5 ? -1 : 1;
    return radians(magnitude) * direction;
  }
  function advanceAngle(angle, speed, seconds) { return (angle + speed * seconds) % (Math.PI * 2); }
  function hitTile(tile, x, y, size, padding = 0) {
    const dx = x - tile.x, dy = y - tile.y;
    const localX = dx * Math.cos(-tile.tilt) - dy * Math.sin(-tile.tilt);
    const localY = dx * Math.sin(-tile.tilt) + dy * Math.cos(-tile.tilt);
    return Math.abs(localX) <= size / 2 + padding && Math.abs(localY) <= size / 2 + padding;
  }
  return { radians, rotationSpeed, advanceAngle, hitTile };
});
