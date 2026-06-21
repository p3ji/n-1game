const fs = require('fs');
const path = require('path');

// --- Source paths ---
const enablePath = path.join(__dirname, 'enable1.txt');      // full ENABLE list (172k words)
const commonPath = 'C:/Users/pushp/.gemini/antigravity/brain/6cbc47ff-60e2-4da7-baa3-bdcbde5b9db8/.system_generated/steps/8/content.md';
const outputPath = path.join(__dirname, 'words_data.js');

// --- Helpers ---
function parseWordList(filePath, maxLen = 7) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const words = new Set();
  for (const line of lines) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]{3,}$/.test(w) && w.length <= maxLen) {
      words.add(w);
    }
  }
  return words;
}

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

// --- Load dictionaries ---
console.log('Loading ENABLE dictionary (valid subwords)...');
const enableWords = parseWordList(enablePath, 7);
console.log(`  → ${enableWords.size} valid words (length 3-7)`);

console.log('Loading Google 10k list (starter word candidates)...');
const commonWords = parseWordList(commonPath, 7);
console.log(`  → ${commonWords.size} common words (length 3-7)`);

// Starter words must come from common words AND be in ENABLE,
// length 4-7, and not too obscure.
const starterCandidates = [...commonWords].filter(w =>
  enableWords.has(w) && w.length >= 4 && w.length <= 7
);
console.log(`  → ${starterCandidates.length} valid starter candidates`);

// Precompute frequencies for all ENABLE words (for subword checking)
const enableArray = [...enableWords];
const enableFreqs = enableArray.map(w => ({ word: w, freq: getFreq(w) }));

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
  if (!thresholds[len]) continue;

  const sf = getFreq(starter);
  const subwords = [];

  for (const { word, freq } of enableFreqs) {
    // Subword: length 3 to len, can be made from starter letters
    if (word.length >= 3 && word.length <= len && canMake(sf, freq)) {
      subwords.push(word);
    }
  }

  const t = thresholds[len];
  if (subwords.length >= t.min && subwords.length <= t.max) {
    // Sort subwords by length then alphabetically for clean display
    subwords.sort((a, b) => a.length - b.length || a.localeCompare(b));
    categories[len].push({ word: starter, subwords });
  }
}

console.log('\nCandidates found per length:');
for (const len of [7, 6, 5, 4]) {
  console.log(`  ${len} letters: ${categories[len].length} starter words`);
}

// --- Select 20 diverse words per level ---
const selectedData = {};
for (const len of [4, 5, 6, 7]) {
  selectedData[len] = shuffle(categories[len]).slice(0, 20);
}

// --- Write output ---
const output = `// Curated word data for the N-1 Cardboard Word Game
// Dictionary: ENABLE (valid answers) + Google 10k (starter words)
// Generated on ${new Date().toISOString()}
const WORDS_DATA = ${JSON.stringify(selectedData, null, 2)};
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`\n✅ Generated ${outputPath}`);

// --- Quick sanity check: does "morning" contain "gin"? ---
const morningCheck = selectedData[7].find(w => w.word === 'morning');
if (morningCheck) {
  console.log('"morning" subwords:', morningCheck.subwords.join(', '));
  console.log('"gin" included?', morningCheck.subwords.includes('gin'));
} else {
  // Manual check
  const sf = getFreq('morning');
  const gf = getFreq('gin');
  console.log('\nManual check — can "gin" be made from "morning"?', canMake(sf, gf));
  console.log('"gin" in ENABLE?', enableWords.has('gin'));
}
