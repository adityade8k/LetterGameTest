// Rebuild with: node scripts/build-dictionary.cjs /path/to/wordlist-20210729.txt
const fs = require('node:fs');
const path = require('node:path');
const [sourcePath] = process.argv.slice(2);
if (!sourcePath) throw new Error('Provide Wordnik wordlist-20210729.txt. See data/README.md.');
const words = [...new Set(fs.readFileSync(sourcePath, 'utf8').trim().split(/\r?\n/).map(line => line.trim().replace(/^"|"$/g, '')).filter(word => /^[a-z]{3,}$/.test(word)))].sort();
if (words.length < 190000) throw new Error('Unexpected Wordnik input: expected over 190,000 alphabetic words.');
const rows = [];
for (let index = 0; index < words.length; index += 12) rows.push(words.slice(index, index + 12).join(' '));
const output = `/* English game dictionary (${words.length} words).\n * Wordnik Wordlist 20210729. Copyright (c) 2020 Wordnik, MIT License.\n * See data/WORDNIK-LICENSE.txt and data/README.md for license and sources.\n */\n(function (root) {\n  const words = \`\n${rows.join('\n')}\n\`.trim().split(/\\s+/);\n  if (typeof module === 'object' && module.exports) module.exports = words;\n  else root.LETTERFALL_WORDS = words;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n`;
fs.writeFileSync(path.join(__dirname, '../data/words.js'), output);
console.log(`Saved ${words.length.toLocaleString()} words.`);
