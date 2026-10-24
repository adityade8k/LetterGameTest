// Art controls. Gameplay, rotation limits and all timings live in ../config.js.
// Reference sampling and equal-weight averages are in palette-analysis.json.
export const DESIGN = {
  width: 360,
  height: 640,
  fieldTop: 120,
  fieldHeight: 337,
  pixelRatioLimit: 2,
  palette: {
    cream: ['#fae7b5', '#deb79b'],
    plum: ['#92506d', '#603c57'],
    gold: ['#fed276', '#d99662'],
    mint: ['#c2e2c6', '#88b9a9'],
    sky: '#dca4c7',
    magenta: '#efb0bc',
    ember: '#f5c2a5',
    mist: '#ffe3cd',
    horizon: '#f7edac',
    smoke: '#e891b0',
  },
  atmosphere: { grainAmount: 0.018, fogAmount: 0.035 },
  cel: {
    light: [-0.6, 0.8, 1],
    threshold: 0.56, // Two-tone diffuse lighting, without outlines.
  },
  tile: { depth: 9, bevel: 4, corner: 6.5, letterDepth: 2.6, tiltX: 0.18, tiltY: -0.22,
    specularStrength: 0.14, shininess: 56 },
};
