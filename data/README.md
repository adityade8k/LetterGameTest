# Game dictionary

The game bundles **198,294 alphabetic English entries of at least three letters** from [Wordnik's open-source word list](https://github.com/wordnik/wordlist). Wordnik describes this as a word list for game developers and words commonly used in word games. It replaces the former 32,446-word intersection of FrequencyWords and ENABLE, which rejected many legitimate, less frequent words.

- Release file: `wordlist-20210729.txt` (the list currently published in the official repository when fetched).
- Pinned source: https://raw.githubusercontent.com/wordnik/wordlist/46e6215d0f90356afe9c8ba4be347e7e98cb425c/wordlist-20210729.txt
- Source SHA-256: `bfd1b4eb4ade1ba81e84c7e24248b9a1aecec9d9baa427453b367a83e30e0451`
- License: MIT, Copyright (c) 2020 Wordnik. The full original notice is included in `WORDNIK-LICENSE.txt` and must accompany redistribution.
- Transformations: strip enclosing quotes, retain lowercase A–Z entries of at least three letters, deduplicate, sort alphabetically, wrap as a local JavaScript array. No frequency cutoff, maximum word length, or runtime API is used.

To rebuild after downloading the pinned source:

```sh
node scripts/build-dictionary.cjs /path/to/wordlist-20210729.txt
```

This is a word-game lexicon, not a definitions service or official tournament dictionary. Rare words and both American and British spellings are accepted where present. A prefix fails only when no dictionary entry starts with it. For example, `CATQ` fails, while `CATG` now remains playable because `CATGUT` is valid.

Opening words are drawn from the separate, hand-selected everyday-word sets in `opening.js`, and each set is checked against this dictionary. The broader acceptance dictionary does not introduce obscure words into those guaranteed opening choices. All validation happens locally, including offline.
