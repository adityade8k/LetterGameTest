// Art controls. Gameplay, rotation limits and all timings live in ../config.js.
// Reference sampling and equal-weight averages are in palette-analysis.json.
export const DESIGN = {
  width: 360,
  height: 640,
  fieldTop: 0,
  fieldHeight: 640, // The falling field fills the entire portrait canvas behind the HUD.
  pixelRatioLimit: 2,
  palette: {
    cream: ['#fae7b5', '#deb79b'],
    plum: ['#92506d', '#603c57'],
    gold: ['#fed276', '#d99662'],
    mint: ['#c2e2c6', '#88b9a9'],
    letterInk: ['#5b4c49', '#413635'],
    purpleLetter: ['#963dc4', '#6d258f'],
    blueLetter: ['#237fd5', '#165493'],
    smokeTile: ['#b83f87', '#92286b'],
    smokeInk: ['#fff3d9', '#ffe7c2'],
    ice: ['#eafaff', '#5b9bca'],
    iceDeep: '#286995',
    iceInk: ['#123b5b', '#102f49'],
    iceTint: '#83bddc',
    fire: ['#ffe329', '#f5861f'],
    fireDeep: '#c8422b',
    fireInk: ['#4b211c', '#3a1c16'],
    fireTint: '#ec382b',
    fireGlow: '#ff6b4f',
    goldSurface: ['#e6ab43', '#ac7127'],
    goldHighlight: ['#fff4bb', '#ffe291'],
    goldInk: ['#563618', '#42280f'],
    // A richer version of the five supplied pastels: blue, coral, peach,
    // blush and warm cream. Tile/UI colors remain independently tuned.
    sky: '#a4daff',
    magenta: '#ffa1ab',
    ember: '#ffdda0',
    mist: '#ffc1d0',
    horizon: '#ffeab3',
    smoke: '#b83f87',
  },
  atmosphere: { grainAmount: 0.018, fogAmount: 0.035 },
  cel: {
    light: [-0.6, 0.8, 1],
    threshold: 0.56, // Two-tone diffuse lighting, without outlines.
  },
  tile: { depth: 9, bevel: 4, corner: 6.5, letterDepth: 2.6, tiltX: 0.18, tiltY: -0.22,
    specularStrength: 0.14, shininess: 56 },
};
