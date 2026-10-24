/* Random pickup and smoke placement, also used by the tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterfallEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function hourglassPosition(width, size, occupied = [], random = Math.random) {
    const margin = size / 2 + 18;
    let best, clearance = -Infinity;
    // Enter above the field at a random horizontal position, favoring a gap.
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = {
        x: Math.min(margin, width / 2) + random() * Math.max(0, width - margin * 2),
        y: -size,
      };
      const distance = occupied.reduce((nearest, tile) => Math.min(nearest, Math.hypot(tile.x - position.x, tile.y - position.y)), Infinity);
      if (distance > clearance) { best = position; clearance = distance; }
      if (distance >= size * 1.3) break;
    }
    return best;
  }
  function smokePatches(width, height, settings, random = Math.random) {
    const columns = Math.ceil(Math.sqrt(settings.patchCount * width / height));
    const rows = Math.ceil(settings.patchCount / columns);
    return Array.from({ length: settings.patchCount }, (_, index) => ({
      x: (index % columns + .3 + random() * .4) / columns,
      y: (Math.floor(index / columns) + .3 + random() * .4) / rows,
      radius: settings.radiusFraction * (.9 + random() * .2),
      phase: random() * Math.PI * 2,
    }));
  }
  return { hourglassPosition, smokePatches };
});
