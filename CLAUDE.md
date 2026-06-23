# N-1 Word Craft — Project Rules & Constraints

## Word Database Rules

### Starter Words
- Length: 4–7 letters
- Must be a common, recognisable English word (present in both ENABLE and the commonWords package)
- The starter word is displayed to the player as the "target" — it is **not** a valid submittable answer

### Subwords (valid player answers)
- Must use only letters that appear in the starter word, with correct frequency (e.g. "hills" allows two L's)
- Length: 3 letters minimum, up to (starter length - 1) maximum — **the starter word itself is excluded**
- Must be a real English word per Merriam-Webster standard (ENABLE word list used as the programmatic proxy, as it is derived from MW)
- No proper nouns, abbreviations, or acronyms
- Each level targets 4–13 subwords per starter word

### Level Structure
| Level | Starter length | Min subwords | Max subwords |
|-------|---------------|--------------|--------------|
| 1     | 4 letters     | 4            | 13           |
| 2     | 5 letters     | 5            | 13           |
| 3     | 6 letters     | 7            | 13           |
| 4     | 7 letters     | 8            | 13           |

### Bonus Word
- The longest valid subword for a given starter is designated the "bonus word"
- Finding it earns the player an extra hint

## Generating / Updating the Database
- Run `node generate_words.js` to regenerate `words_data.js`
- The generator draws starter words from the intersection of ENABLE + commonWords
- Subwords are drawn from ENABLE ∩ commonWords; manually curated additions go in the whitelist inside `generate_words.js`
- After any change, bump the cache version (e.g. `?v=43`) in `index.html` and `sw.js`
