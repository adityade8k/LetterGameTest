# Fredoka mesh font

`fredoka-semibold.typeface.json` is a local Three.js `FontLoader` asset for CLTTR's interface. It produces actual extruded text geometry; it does not use DOM text, a canvas texture, or a runtime font service. Falling letter tiles retain their existing font.

- Family: Fredoka, by the Fredoka Project Authors.
- Source: [Google Fonts' official Fredoka directory](https://github.com/google/fonts/tree/main/ofl/fredoka), `Fredoka[wdth,wght].ttf`.
- License: SIL Open Font License 1.1; full copyright notice and license are included in `Fredoka-OFL.txt`.
- Instance: weight 600 (Semibold), width 100.
- Character coverage: 217 supported Latin letters, numbers, and punctuation, including curly quotes, en/em dashes, and the ellipsis. Unsupported characters use the font's question-mark glyph.
- Resolution: 1000. Source uppercase `H` maximum of 690 is scaled to 1000, so the interface's `size` matches its uppercase height and existing text baselines. Glyph advances and all metrics use the same scale.

The asset was converted with fontTools 4.60.1 from the official [fontTools repository](https://github.com/fonttools/fonttools). The variable font was instantiated at `wght=600, wdth=100`; outlines were converted to Three.js `m`, `l`, `q`, and `b` commands. Quadratic/cubic commands place the endpoint before control points as required by Three.js. All contours were reversed together to match Three.js winding, preserving the opposite direction of counters and exteriors. Geometry validation covers every included glyph and the counters in `A`, `B`, `O`, `P`, `8`, `a`, and `e`.

Source SHA-256 and provenance are embedded in the JSON's `original_font_information`. The font and conversion tools require no package installation or network connection at game runtime.
