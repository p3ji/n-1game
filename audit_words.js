// Audit script for N-1 word database
// Rules:
//   Subwords: in ENABLE, length 3..starterLength, NOT the starter word itself
//   Letters must be drawable from starter with correct frequency
//   Starter word itself must never appear as a subword

const fs = require('fs');
const path = require('path');

// --- Load ENABLE ---
const enableRaw = fs.readFileSync(path.join(__dirname, 'enable1.txt'), 'utf8');
const enableSet = new Set(
  enableRaw.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{3,7}$/.test(w))
);
console.log(`ENABLE loaded: ${enableSet.size} words`);

// --- Load current words_data.js ---
let src = fs.readFileSync(path.join(__dirname, 'words_data.js'), 'utf8');
src = src.replace(/\/\/.*$/gm, '').replace(/const WORDS_DATA\s*=\s*/, '').replace(/;\s*$/, '').trim();
const WORDS_DATA = JSON.parse(src);

// --- Helpers ---
function letterFreq(word) {
  const f = {};
  for (const c of word) f[c] = (f[c] || 0) + 1;
  return f;
}
function canMake(starterFreq, candidateFreq) {
  for (const c in candidateFreq) {
    if ((starterFreq[c] || 0) < candidateFreq[c]) return false;
  }
  return true;
}

// Precompute freq for all ENABLE words 3-7 chars
const enableEntries = [];
for (const w of enableSet) {
  enableEntries.push({ word: w, freq: letterFreq(w) });
}

// --- Audit ---
const report = {
  starterRemovedFromSubwords: [],  // starter word found in its own subword list
  invalidSubwords: [],             // subword not in ENABLE
  missingSubwords: [],             // ENABLE word that should be a subword but isn't
  newStarters: [],                 // starter words not in DB that have valid subword counts
};

const thresholds = { 4: { min: 4 }, 5: { min: 5 }, 6: { min: 7 }, 7: { min: 8 } };
const existingStarters = new Set();

for (const len of [4, 5, 6, 7]) {
  for (const entry of WORDS_DATA[len]) {
    const starter = entry.word;
    existingStarters.add(starter);
    const sf = letterFreq(starter);
    const currentSet = new Set(entry.subwords);

    // Rule 1: starter word must not be in its own subword list
    if (currentSet.has(starter)) {
      report.starterRemovedFromSubwords.push({ starter, word: starter });
    }

    // Rule 2: each current subword must be in ENABLE
    for (const sw of entry.subwords) {
      if (sw === starter) continue; // already flagged above
      if (!enableSet.has(sw)) {
        report.invalidSubwords.push({ starter, word: sw });
      }
    }

    // Rule 3: find all ENABLE words that should be subwords but are missing
    for (const { word, freq } of enableEntries) {
      if (word === starter) continue;
      if (word.length < 3 || word.length > len) continue;
      if (!canMake(sf, freq)) continue;
      if (!currentSet.has(word)) {
        report.missingSubwords.push({ starter, word, len: word.length });
      }
    }
  }
}

// --- Find new starter words ---
// Starter candidates: in ENABLE, length 4-7, not already in DB
const starterCandidates = [...enableSet].filter(w =>
  w.length >= 4 && w.length <= 7 && !existingStarters.has(w)
);

for (const starter of starterCandidates) {
  const len = starter.length;
  const t = thresholds[len];
  if (!t) continue;
  const sf = letterFreq(starter);

  const subwords = [];
  for (const { word, freq } of enableEntries) {
    if (word === starter) continue;
    if (word.length < 3 || word.length > len) continue;
    if (canMake(sf, freq)) subwords.push(word);
  }

  if (subwords.length >= t.min && subwords.length <= 13) {
    report.newStarters.push({ starter, len, subwordCount: subwords.length });
  }
}

// --- Output report ---
const out = {
  summary: {
    startersSelfReferencing: report.starterRemovedFromSubwords.length,
    invalidSubwords: report.invalidSubwords.length,
    missingSubwords: report.missingSubwords.length,
    newStarterCandidates: report.newStarters.length,
  },
  starterRemovedFromSubwords: report.starterRemovedFromSubwords,
  invalidSubwords: report.invalidSubwords,
  missingSubwords: report.missingSubwords,
  newStarters: report.newStarters.slice(0, 200), // cap for readability
};

fs.writeFileSync(path.join(__dirname, 'audit_report.json'), JSON.stringify(out, null, 2));
console.log('\n=== AUDIT SUMMARY ===');
console.log('Starter word in its own subword list:', out.summary.startersSelfReferencing);
console.log('Invalid subwords (not in ENABLE):    ', out.summary.invalidSubwords);
console.log('Missing subwords (false negatives):  ', out.summary.missingSubwords);
console.log('New starter candidates:              ', out.summary.newStarterCandidates);
console.log('\nFull report written to audit_report.json');
