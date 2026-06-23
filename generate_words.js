const fs = require('fs');
const path = require('path');

// --- Source paths ---
const enablePath = path.join(__dirname, 'enable1.txt');
const outputPath = path.join(__dirname, 'words_data.js');

// --- Helpers ---
function getFreq(word) {
  const freq = {};
  for (const c of word) freq[c] = (freq[c] || 0) + 1;
  return freq;
}

function canMake(starterFreq, candidateFreq) {
  for (const c in candidateFreq) {
    if ((starterFreq[c] || 0) < candidateFreq[c]) return false;
  }
  return true;
}

// --- Load ENABLE (MW-equivalent) ---
console.log('Loading ENABLE dictionary...');
const enableRaw = fs.readFileSync(enablePath, 'utf8');
const enableSet = new Set(
  enableRaw.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{3,7}$/.test(w))
);
console.log(`  → ${enableSet.size} valid words (length 3-7)`);

// Precompute frequencies for all ENABLE words
const enableEntries = [...enableSet].map(w => ({ word: w, freq: getFreq(w) }));

// Starter candidates: any ENABLE word of length 4-7
const starterCandidates = [...enableSet].filter(w => w.length >= 4 && w.length <= 7);
console.log(`  → ${starterCandidates.length} starter candidates`);

// Thresholds for number of subwords per level (max 13 to fit on mobile screen)
const thresholds = {
  7: { min: 8,  max: 13 },
  6: { min: 7,  max: 13 },
  5: { min: 5,  max: 13 },
  4: { min: 4,  max: 13 }
};

// Shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Build categories ---
const categories = { 7: [], 6: [], 5: [], 4: [] };

for (const starter of starterCandidates) {
  const len = starter.length;
  const t = thresholds[len];
  if (!t) continue;

  const sf = getFreq(starter);
  const subwords = [];

  for (const { word, freq } of enableEntries) {
    // Subword: length 3 to len, can be made from starter letters, NOT the starter itself
    if (word !== starter && word.length >= 3 && word.length <= len && canMake(sf, freq)) {
      subwords.push(word);
    }
  }

  if (subwords.length >= t.min && subwords.length <= t.max) {
    subwords.sort((a, b) => a.length - b.length || a.localeCompare(b));
    categories[len].push({ word: starter, subwords });
  }
}

console.log('\nCandidates found per length:');
for (const len of [7, 6, 5, 4]) {
  console.log(`  ${len} letters: ${categories[len].length} starter words`);
}

// --- Select up to 500 diverse words per level ---
const selectedData = {};
for (const len of [4, 5, 6, 7]) {
  selectedData[len] = shuffle(categories[len]).slice(0, 500);
}

// --- Write output ---
const output = `// Word data for the N-1 Cardboard Word Game
// Dictionary: ENABLE (Merriam-Webster equivalent)
// Starter word is excluded from each entry's subword list (cannot be submitted)
// Generated on ${new Date().toISOString()}
const WORDS_DATA = ${JSON.stringify(selectedData, null, 2)};
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`\n✅ Generated ${outputPath}`);
for (const len of [4, 5, 6, 7]) {
  const total = selectedData[len].reduce((s, e) => s + e.subwords.length, 0);
  console.log(`  ${len}-letter: ${selectedData[len].length} starters, ${total} total subwords`);
}
