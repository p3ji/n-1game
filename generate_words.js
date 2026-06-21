const fs = require('fs');
const path = require('path');

// Path to the downloaded 10k words file
const sourcePath = 'C:/Users/pushp/.gemini/antigravity/brain/6cbc47ff-60e2-4da7-baa3-bdcbde5b9db8/.system_generated/steps/8/content.md';
const outputPath = path.join(__dirname, 'words_data.js');

try {
  const content = fs.readFileSync(sourcePath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  // Extract words: must be all lowercase, length 3 to 7, and only contain a-z
  const words = [];
  const wordSet = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    // Skip headers and empty lines
    if (!line || line.includes(':') || line.includes('---') || line.startsWith('title') || line.startsWith('description') || line.startsWith('source')) {
      continue;
    }
    // Validate character set and length
    if (/^[a-z]{3,7}$/.test(line)) {
      if (!wordSet.has(line)) {
        words.push(line);
        wordSet.add(line);
      }
    }
  }

  console.log(`Loaded ${words.length} valid words (lengths 3-7) from source.`);

  // Helper to count character frequencies
  function getFreq(word) {
    const freq = {};
    for (const char of word) {
      freq[char] = (freq[char] || 0) + 1;
    }
    return freq;
  }

  // Helper to check if word2 can be made from letters of word1
  function canMake(word1Freq, word2Freq) {
    for (const char in word2Freq) {
      if (!word1Freq[char] || word1Freq[char] < word2Freq[char]) {
        return false;
      }
    }
    return true;
  }

  // Pre-calculate frequencies for all words
  const wordFreqs = words.map(w => ({ word: w, freq: getFreq(w) }));

  const categories = { 7: [], 6: [], 5: [], 4: [] };

  // Subword thresholds for a fun gameplay experience (not too many, not too few)
  const thresholds = {
    7: { min: 10, max: 25 },
    6: { min: 8, max: 20 },
    5: { min: 6, max: 15 },
    4: { min: 4, max: 10 }
  };

  // Find candidate starter words
  for (const item of wordFreqs) {
    const len = item.word.length;
    if (len >= 4 && len <= 7) {
      const subwords = [];
      for (const other of wordFreqs) {
        // Subword must be shorter or equal in length, and at least 3 letters
        if (other.word.length <= len && other.word.length >= 3) {
          if (canMake(item.freq, other.freq)) {
            subwords.push(other.word);
          }
        }
      }

      const limit = thresholds[len];
      if (subwords.length >= limit.min && subwords.length <= limit.max) {
        // Sort subwords by length first, then alphabetically
        subwords.sort((a, b) => {
          if (a.length !== b.length) {
            return a.length - b.length;
          }
          return a.localeCompare(b);
        });

        categories[len].push({
          word: item.word,
          subwords: subwords
        });
      }
    }
  }

  console.log('Candidates found per length:');
  console.log(`7 letters: ${categories[7].length}`);
  console.log(`6 letters: ${categories[6].length}`);
  console.log(`5 letters: ${categories[5].length}`);
  console.log(`4 letters: ${categories[4].length}`);

  // Select up to 15 diverse and interesting words for each category
  const selectedData = {};
  
  // Shuffle helper
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  for (const len of [4, 5, 6, 7]) {
    const list = categories[len];
    shuffle(list);
    
    // Choose the best ones. Avoid words that are too obscure if possible,
    // or just pick the top 15 from the shuffled list.
    // Let's filter out candidates whose starter words are very obscure, or just limit to 15.
    selectedData[len] = list.slice(0, 15);
  }

  // Write output as a global JS object for easy script-tag inclusion
  const outputContent = `// Curated word data for the N-1 Cardboard Word Game
// Generated on ${new Date().toISOString()}
const WORDS_DATA = ${JSON.stringify(selectedData, null, 2)};
`;

  fs.writeFileSync(outputPath, outputContent, 'utf8');
  console.log(`Successfully generated word database at: ${outputPath}`);

} catch (err) {
  console.error('Error processing words:', err);
}
