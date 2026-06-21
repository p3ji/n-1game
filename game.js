// game.js - Cardboard Word Game Logic

// --- GAME STATE ---
let gameState = {
  totalScore: 0,
  highScore: 0,
  level: 7, // 7 letters -> 6 letters -> 5 letters -> 4 letters
  currentWordObj: null, // { word: 'weather', subwords: [...] }
  foundWords: [], // List of found words
  spelledWord: '',
  selectedTileIndices: [], // Indices of letter tiles currently selected
  soundEnabled: true,
  hintsRevealed: {} // maps wordIndex -> array of indices of revealed letters
};

// Audio variables
let audioCtx = null;

// Confetti variables
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let confettiParticles = [];
let confettiAnimationId = null;

// Mascot idle interval
let mascotIdleTimer = null;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  loadHighScore();
  loadGameState();
  initConfetti();
  
  // Set up event listeners
  document.getElementById('btn-sound').addEventListener('click', toggleSound);
  document.getElementById('btn-help').addEventListener('click', showHelp);
  document.getElementById('btn-close-help').addEventListener('click', hideHelp);
  document.getElementById('btn-reset').addEventListener('click', showResetConfirm);
  document.getElementById('btn-cancel-reset').addEventListener('click', hideResetConfirm);
  document.getElementById('btn-confirm-reset').addEventListener('click', resetGame);
  document.getElementById('btn-clear').addEventListener('click', clearSpelledWord);
  document.getElementById('btn-shuffle').addEventListener('click', shuffleLetters);
  document.getElementById('btn-submit').addEventListener('click', submitSpelledWord);
  document.getElementById('btn-hint').addEventListener('click', purchaseHint);
  document.getElementById('btn-purchase').addEventListener('click', purchaseNextLevel);
  document.getElementById('btn-play-again').addEventListener('click', restartFromScratch);

  // Keyboard input
  window.addEventListener('keydown', handleKeyboardInput);

  // Resize canvas
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Start game
  if (!gameState.currentWordObj) {
    startNewLevel(gameState.level);
  } else {
    // We loaded a saved game, rebuild UI
    setupLevelUI();
    updateScoreUI();
    updateProgressUI();
  }

  // Boxy initial speech
  setTimeout(() => {
    boxySpeak("Hi! Let's craft some words out of cardboard!", 4000);
  }, 1000);

  // Start mascot idle chatter
  startMascotIdleChatter();
});

// --- STATE PERSISTENCE ---
function loadHighScore() {
  const saved = localStorage.getItem('n1_highScore');
  if (saved) {
    gameState.highScore = parseInt(saved, 10);
  }
}

function saveHighScore() {
  localStorage.setItem('n1_highScore', gameState.highScore);
}

function loadGameState() {
  const saved = localStorage.getItem('n1_gameState');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      gameState.totalScore = parsed.totalScore || 0;
      gameState.level = parsed.level || 7;
      gameState.foundWords = parsed.foundWords || [];
      gameState.hintsRevealed = parsed.hintsRevealed || {};
      gameState.soundEnabled = parsed.soundEnabled !== false;
      
      // Look up current word obj from WORDS_DATA
      if (parsed.currentWord) {
        const wordsList = WORDS_DATA[gameState.level] || [];
        const match = wordsList.find(w => w.word === parsed.currentWord);
        if (match) {
          gameState.currentWordObj = match;
        }
      }
      
      updateSoundButtonUI();
    } catch (e) {
      console.error('Failed to parse saved game state', e);
    }
  }
}

function saveGameState() {
  const stateToSave = {
    totalScore: gameState.totalScore,
    level: gameState.level,
    currentWord: gameState.currentWordObj ? gameState.currentWordObj.word : null,
    foundWords: gameState.foundWords,
    hintsRevealed: gameState.hintsRevealed,
    soundEnabled: gameState.soundEnabled
  };
  localStorage.setItem('n1_gameState', JSON.stringify(stateToSave));
}

// --- SOUND SYNTHESIS ENGINE (Web Audio API) ---
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTapSound() {
  if (!gameState.soundEnabled) return;
  initAudio();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  // Damped low frequency tap (wood/cardboard)
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(120, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.15);
  
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.16);
}

function playChimeSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  // Toy xylophone major chord (C5, E5, G5)
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    // Arpeggiate slightly
    const delay = idx * 0.05;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.6);
    
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + 0.65);
  });
}

function playCrinkleSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  // White noise burst for paper tearing/crinkling
  const bufferSize = audioCtx.sampleRate * 0.25; // 0.25 seconds
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
  filter.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.2);
  filter.Q.value = 3;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  // Jagged volume changes to simulate crinkling
  gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
  gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  
  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noiseNode.start();
  noiseNode.stop(audioCtx.currentTime + 0.26);
}

function playScribbleSound() {
  if (!gameState.soundEnabled) return;
  initAudio();
  
  // Pencil draw scribble sound (rhythmic high-pass noise sweeps)
  const duration = 0.4;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(3000, audioCtx.currentTime);
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  
  // Rhythmic scribbling (two strokes)
  gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  
  gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.38);
  
  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noiseNode.start();
  noiseNode.stop(audioCtx.currentTime + duration);
}

function playLevelUpSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  // Low drums (box taps) followed by a celebratory synthesizer sweep
  const now = audioCtx.currentTime;
  
  // Low drum roll
  for (let i = 0; i < 4; i++) {
    const tapTime = now + i * 0.12;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100 + i * 20, tapTime);
    gain.gain.setValueAtTime(0.4, tapTime);
    gain.gain.exponentialRampToValueAtTime(0.01, tapTime + 0.1);
    
    osc.start(tapTime);
    osc.stop(tapTime + 0.11);
  }

  // Celebratory sweep
  const sweepStart = now + 0.48;
  const oscSweep = audioCtx.createOscillator();
  const gainSweep = audioCtx.createGain();
  oscSweep.connect(gainSweep);
  gainSweep.connect(audioCtx.destination);
  
  oscSweep.type = 'triangle';
  oscSweep.frequency.setValueAtTime(300, sweepStart);
  oscSweep.frequency.exponentialRampToValueAtTime(1200, sweepStart + 0.5);
  
  gainSweep.gain.setValueAtTime(0, sweepStart);
  gainSweep.gain.linearRampToValueAtTime(0.3, sweepStart + 0.1);
  gainSweep.gain.exponentialRampToValueAtTime(0.001, sweepStart + 0.6);
  
  oscSweep.start(sweepStart);
  oscSweep.stop(sweepStart + 0.65);
}

function toggleSound() {
  initAudio();
  gameState.soundEnabled = !gameState.soundEnabled;
  updateSoundButtonUI();
  saveGameState();
  playTapSound();
}

function updateSoundButtonUI() {
  const iconOn = document.querySelector('.icon-speaker');
  const iconOff = document.querySelector('.icon-speaker-muted');
  if (gameState.soundEnabled) {
    iconOn.classList.remove('hidden');
    iconOff.classList.add('hidden');
  } else {
    iconOn.classList.add('hidden');
    iconOff.classList.remove('hidden');
  }
}

// --- GAME LOGIC & ENGINE ---

function startNewLevel(n) {
  gameState.level = n;
  gameState.foundWords = [];
  gameState.hintsRevealed = {};
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  
  // Pick random starter word from WORDS_DATA of size n
  const candidates = WORDS_DATA[n] || [];
  if (candidates.length === 0) {
    console.error(`No word candidates for level ${n}`);
    return;
  }
  
  const randIndex = Math.floor(Math.random() * candidates.length);
  gameState.currentWordObj = candidates[randIndex];
  
  setupLevelUI();
  updateScoreUI();
  updateProgressUI();
  saveGameState();
}

function setupLevelUI() {
  const wordObj = gameState.currentWordObj;
  if (!wordObj) return;

  // Set starter word indicator
  document.getElementById('current-word-display').textContent = wordObj.word;

  // Render Target Words Grid (Notebook sheet)
  const grid = document.getElementById('target-words-grid');
  grid.innerHTML = '';
  
  wordObj.subwords.forEach((subword, wordIdx) => {
    const isFound = gameState.foundWords.includes(subword);
    
    // Create word slot container
    const container = document.createElement('div');
    container.className = 'word-slot-container';
    
    const slot = document.createElement('div');
    slot.className = `word-slots ${isFound ? 'revealed' : ''}`;
    slot.setAttribute('data-word', subword);
    slot.setAttribute('data-index', wordIdx);
    
    // Build letter boxes
    for (let charIdx = 0; charIdx < subword.length; charIdx++) {
      const box = document.createElement('div');
      box.className = 'letter-box';
      
      if (isFound) {
        box.textContent = subword[charIdx];
      } else {
        // Check if this letter was revealed by a hint
        const revealedIndices = gameState.hintsRevealed[wordIdx] || [];
        if (revealedIndices.includes(charIdx)) {
          box.textContent = subword[charIdx];
          box.classList.add('revealed-letter');
        } else {
          box.textContent = '';
        }
      }
      slot.appendChild(box);
    }
    
    container.appendChild(slot);
    grid.appendChild(container);
  });

  // Render Letter Wheel
  renderLetterWheel();
  
  // Update shop text
  const nextSize = gameState.level - 1;
  const shopTitle = document.getElementById('shop-item-name');
  const shopPrice = document.getElementById('shop-item-price');
  
  if (nextSize >= 4) {
    shopTitle.textContent = `${nextSize}-Letter Starter Word`;
    const price = calculateNextLevelPrice();
    shopPrice.textContent = price;
  } else {
    // Already at level 4, next is winning!
    shopTitle.textContent = `Ultimate Victory Trophy`;
    shopPrice.textContent = 'FREE';
  }

  // Clear typed display
  updateTypedDisplay();
}

function renderLetterWheel() {
  const wheel = document.getElementById('letter-wheel');
  // Clear old letter tiles (keep the pin)
  const tiles = wheel.querySelectorAll('.wheel-letter-tile');
  tiles.forEach(tile => tile.remove());

  const word = gameState.currentWordObj.word;
  const chars = word.split('');
  
  // Arrange in circle
  const radius = 80; // px
  const center = 110; // 220px container center is 110
  
  chars.forEach((char, idx) => {
    const tile = document.createElement('div');
    tile.className = 'wheel-letter-tile';
    tile.textContent = char;
    tile.setAttribute('data-index', idx);
    tile.setAttribute('data-char', char);
    
    // Position using trig
    const angle = (idx / chars.length) * 2 * Math.PI - Math.PI / 2; // start at top
    const x = center + radius * Math.cos(angle) - 22; // 22 is half of tile width (44px)
    const y = center + radius * Math.sin(angle) - 22; // 22 is half of tile height (44px)
    
    tile.style.left = `${x}px`;
    tile.style.top = `${y}px`;
    
    // Interaction
    tile.addEventListener('click', () => handleTileClick(idx));
    
    wheel.appendChild(tile);
  });
}

function handleTileClick(idx) {
  const word = gameState.currentWordObj.word;
  const char = word[idx];
  
  // If already selected, deselect it (and remove its letter from typed word)
  const selectedIdx = gameState.selectedTileIndices.indexOf(idx);
  if (selectedIdx !== -1) {
    playTapSound();
    gameState.selectedTileIndices.splice(selectedIdx, 1);
    // Rebuild spelledWord based on remaining selected tiles
    gameState.spelledWord = gameState.selectedTileIndices.map(i => word[i]).join('');
    updateTileSelectionUI();
    updateTypedDisplay();
  } else {
    // Select it
    playTapSound();
    gameState.selectedTileIndices.push(idx);
    gameState.spelledWord += char;
    updateTileSelectionUI();
    updateTypedDisplay();
  }
}

function updateTileSelectionUI() {
  const tiles = document.querySelectorAll('.wheel-letter-tile');
  tiles.forEach(tile => {
    const idx = parseInt(tile.getAttribute('data-index'), 10);
    if (gameState.selectedTileIndices.includes(idx)) {
      tile.classList.add('selected');
    } else {
      tile.classList.remove('selected');
    }
  });
}

function updateTypedDisplay() {
  const display = document.getElementById('spelled-word-text');
  display.textContent = gameState.spelledWord;
}

function clearSpelledWord() {
  playTapSound();
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  updateTileSelectionUI();
  updateTypedDisplay();
}

function shuffleLetters() {
  playTapSound();
  // Clear active typing so we don't desynchronize tiles
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  updateTypedDisplay();

  // Shuffle letters in the currentWordObj.word
  const word = gameState.currentWordObj.word;
  const chars = word.split('');
  
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  
  gameState.currentWordObj.word = chars.join('');
  renderLetterWheel();
  
  triggerBoxyEmotion('idle');
  boxySpeak("Let me shake these up for you!", 2000);
}

// --- KEYBOARD HANDLING ---
function handleKeyboardInput(e) {
  const key = e.key.toLowerCase();
  
  // Ignore keys if modals are open
  if (!document.getElementById('help-modal').classList.contains('hidden') ||
      !document.getElementById('victory-modal').classList.contains('hidden') ||
      !document.getElementById('reset-modal').classList.contains('hidden')) {
    return;
  }

  // Handle backspace
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (gameState.spelledWord.length > 0) {
      playTapSound();
      gameState.spelledWord = gameState.spelledWord.slice(0, -1);
      gameState.selectedTileIndices.pop();
      updateTileSelectionUI();
      updateTypedDisplay();
    }
    return;
  }

  // Handle enter
  if (e.key === 'Enter') {
    e.preventDefault();
    submitSpelledWord();
    return;
  }

  // Handle escape
  if (e.key === 'Escape') {
    e.preventDefault();
    clearSpelledWord();
    return;
  }

  // Handle space for shuffle
  if (e.key === ' ') {
    e.preventDefault();
    shuffleLetters();
    return;
  }

  // Handle letter typing
  if (/^[a-z]$/.test(key)) {
    // Find if this letter is available in the starter word and not fully used yet
    const starterWord = gameState.currentWordObj.word;
    
    // Count letter counts in starter word vs currently selected
    const getLetterCounts = (str) => {
      const counts = {};
      for (const c of str) counts[c] = (counts[c] || 0) + 1;
      return counts;
    };
    
    const starterCounts = getLetterCounts(starterWord);
    const spelledCounts = getLetterCounts(gameState.spelledWord);
    
    if (starterCounts[key] && (spelledCounts[key] || 0) < starterCounts[key]) {
      // Find an unused index for this letter on the wheel
      const tiles = document.querySelectorAll('.wheel-letter-tile');
      let foundIdx = -1;
      for (let i = 0; i < tiles.length; i++) {
        const tileIdx = parseInt(tiles[i].getAttribute('data-index'), 10);
        const tileChar = tiles[i].getAttribute('data-char');
        if (tileChar === key && !gameState.selectedTileIndices.includes(tileIdx)) {
          foundIdx = tileIdx;
          break;
        }
      }
      
      if (foundIdx !== -1) {
        playTapSound();
        gameState.selectedTileIndices.push(foundIdx);
        gameState.spelledWord += key;
        updateTileSelectionUI();
        updateTypedDisplay();
      }
    } else {
      // Letter not available or already all used
      triggerBoxyEmotion('sad');
      playTapSound(); // dry tap
    }
  }
}

// --- SUBMIT WORD ---
function submitSpelledWord() {
  const word = gameState.spelledWord.trim().toLowerCase();
  if (word.length < 3) {
    if (word.length > 0) {
      triggerBoxyEmotion('sad');
      boxySpeak("Words must be at least 3 letters!", 2000);
      playCrinkleSound(); // paper tear/buzz
    }
    return;
  }

  const subwords = gameState.currentWordObj.subwords;
  const isFound = gameState.foundWords.includes(word);
  const isValid = subwords.includes(word);

  if (isFound) {
    triggerBoxyEmotion('dizzy');
    boxySpeak(`You already found "${word.toUpperCase()}"!`, 2500);
    playCrinkleSound();
    shakeInputBox();
  } else if (isValid) {
    // Success!
    gameState.foundWords.push(word);
    
    // Calculate points
    const points = word.length * 100;
    gameState.totalScore += points;
    if (gameState.totalScore > gameState.highScore) {
      gameState.highScore = gameState.totalScore;
      saveHighScore();
    }
    
    // Play sounds & animations
    playChimeSound();
    triggerBoxyEmotion('happy');
    
    // Choose Boxy compliment
    const compliments = ["Splendid!", "Awesome!", "You nailed it!", "Crafty spelling!", "Fantastic!", "Amazing!"];
    const randComp = compliments[Math.floor(Math.random() * compliments.length)];
    boxySpeak(`${randComp} +${points} pts`, 3000);
    
    // Confetti scrap burst!
    triggerConfettiBurst();
    
    // Reveal word in grid
    revealWordInGrid(word);
    
    // Update displays
    updateScoreUI();
    updateProgressUI();
    
    // Reset typing
    gameState.spelledWord = '';
    gameState.selectedTileIndices = [];
    updateTileSelectionUI();
    updateTypedDisplay();
    
    saveGameState();
    
    // Check if level completed (which means finding ALL words)
    checkDirectVictory();
  } else {
    // Invalid word
    triggerBoxyEmotion('sad');
    const comments = ["Hmm, not in my dictionary!", "Is that a word?", "Try again!", "Nope, not this time!"];
    const randComment = comments[Math.floor(Math.random() * comments.length)];
    boxySpeak(randComment, 2500);
    playCrinkleSound();
    shakeInputBox();
  }
}

function shakeInputBox() {
  const container = document.querySelector('.input-cardboard-piece');
  container.classList.add('shake-anim');
  container.addEventListener('animationend', () => {
    container.classList.remove('shake-anim');
  }, { once: true });
}

// Inline shake animation using CSS injection if not in stylesheet
// Added keyframes for shake-anim in style.css or dynamically:
const style = document.createElement('style');
style.textContent = `
  @keyframes shake-input {
    0%, 100% { transform: rotate(-1deg) translateX(0); }
    20%, 60% { transform: rotate(-1deg) translateX(-6px); }
    40%, 80% { transform: rotate(-1deg) translateX(6px); }
  }
  .shake-anim {
    animation: shake-input 0.3s ease-in-out;
  }
`;
document.head.appendChild(style);

function revealWordInGrid(word) {
  const slots = document.querySelector(`.word-slots[data-word="${word}"]`);
  if (slots) {
    slots.classList.add('revealed');
    // Set text in all letter boxes
    const boxes = slots.querySelectorAll('.letter-box');
    for (let i = 0; i < word.length; i++) {
      boxes[i].textContent = word[i];
      boxes[i].classList.remove('revealed-letter'); // remove hint style
    }
  }
}

// --- SCORE & PROGRESS UI ---
function updateScoreUI() {
  document.getElementById('total-score').textContent = String(gameState.totalScore).padStart(4, '0');
  document.getElementById('high-score').textContent = String(gameState.highScore).padStart(4, '0');
}

function updateProgressUI() {
  const W = gameState.currentWordObj.subwords.length;
  const foundCount = gameState.foundWords.length;
  
  // Progress text
  document.getElementById('words-found-count').textContent = `${foundCount} / ${W}`;
  
  // Progress bar width
  const progressPercent = Math.min(100, (foundCount / W) * 100);
  const progressBar = document.getElementById('words-progress-bar');
  progressBar.style.width = `${progressPercent}%`;
  
  // Target goal to unlock shop: W - 1 words
  const goalCount = Math.max(1, W - 1);
  const goalPercent = (goalCount / W) * 100;
  
  // Position goal marker on progress bar
  const goalMarker = document.getElementById('goal-marker');
  goalMarker.style.left = `${goalPercent}%`;
  
  // Progress sub-text
  const needed = goalCount - foundCount;
  const subText = document.getElementById('progress-sub-text');
  
  const purchaseButton = document.getElementById('btn-purchase');
  const shopHintText = document.getElementById('shop-hint-text');

  if (needed > 0) {
    document.getElementById('words-needed-to-unlock').textContent = needed;
    document.querySelector('.progress-sub-text').style.display = 'block';
    
    // Shop locked
    purchaseButton.classList.remove('ready');
    purchaseButton.classList.add('disabled');
    purchaseButton.disabled = true;
    shopHintText.textContent = `Find ${needed} more word(s) to unlock!`;
  } else {
    // Goal reached! Shop unlocked
    document.querySelector('.progress-sub-text').style.display = 'none';
    
    purchaseButton.classList.add('ready');
    purchaseButton.classList.remove('disabled');
    purchaseButton.disabled = false;
    shopHintText.textContent = `Unlocked! Ready to purchase!`;
    
    // Check if Boxy should announce it (once)
    if (!gameState.isLevelUnlocked) {
      gameState.isLevelUnlocked = true;
      triggerBoxyEmotion('happy');
      boxySpeak("Nice! The next starter word is ready in the shop!", 4000);
    }
  }
}

function calculateNextLevelPrice() {
  // Price = (W - 1) * 200 points
  const W = gameState.currentWordObj.subwords.length;
  return (W - 1) * 200;
}

// --- SHOP PURCHASING & PROGRESSION ---
function purchaseNextLevel() {
  if (gameState.foundWords.length < gameState.currentWordObj.subwords.length - 1) {
    // Insufficient progress
    playCrinkleSound();
    return;
  }

  const price = calculateNextLevelPrice();
  
  if (gameState.totalScore < price && gameState.level > 4) {
    // Points are actually accumulated from solving, they should always have enough
    // if price is exactly equal to what they earned. But just in case:
    boxySpeak("Oh, we don't have enough points! Keep finding words!", 3000);
    playCrinkleSound();
    return;
  }

  // Deduct points
  gameState.totalScore = Math.max(0, gameState.totalScore - price);
  updateScoreUI();

  playLevelUpSound();
  
  // Decrement N (Level size)
  const nextLevel = gameState.level - 1;
  gameState.isLevelUnlocked = false;

  if (nextLevel < 4) {
    // Player just completed Level 4 (purchased the "next level" at 4 letters)
    // Wait, the prompt says: "this continues until they purchase a 4 letters word."
    // Let's see: if they are at 5-letter level, and purchase a 4-letter word.
    // They are now loaded with a 4-letter starter word.
    // Once they complete the 4-letter starter word (all-but-one found), that's the end!
    // So if nextLevel was already 4 (they were at level 5, purchase 4), they load level 4.
    // Wait, if they are AT level 4, and click "Purchase" (which is Victory), then they win!
    showVictoryModal();
  } else {
    // Load next level
    boxySpeak(`Purchased! Let's build a box of ${nextLevel} letters!`, 4500);
    triggerBoxyEmotion('happy');
    startNewLevel(nextLevel);
  }
}

function checkDirectVictory() {
  // If player finds ALL words (W/W) on level 4, they win!
  // If they find W-1 words on level 4, the shop button is active and says "CLAIM VICTORY"
  const W = gameState.currentWordObj.subwords.length;
  const found = gameState.foundWords.length;
  
  if (gameState.level === 4 && found >= W - 1) {
    // They have cleared the final level! Update the shop button to buy Victory
    const purchaseButton = document.getElementById('btn-purchase');
    purchaseButton.textContent = "CLAIM VICTORY";
    purchaseButton.classList.add('ready');
    purchaseButton.classList.remove('disabled');
    purchaseButton.disabled = false;
    
    // If they find literally every single word (W/W)
    if (found === W) {
      showVictoryModal();
    }
  }
}

// --- HINTS ---
function purchaseHint() {
  const hintCost = 250;
  if (gameState.totalScore < hintCost) {
    boxySpeak("Hints cost 250 points! Keep spelling!", 3000);
    playCrinkleSound();
    return;
  }

  // Find a word that hasn't been found yet
  const subwords = gameState.currentWordObj.subwords;
  const unfoundIndices = [];
  
  subwords.forEach((word, wordIdx) => {
    if (!gameState.foundWords.includes(word)) {
      unfoundIndices.push(wordIdx);
    }
  });

  if (unfoundIndices.length === 0) {
    boxySpeak("You found all the words! No hints needed!", 3500);
    playCrinkleSound();
    return;
  }

  // Deduct points
  gameState.totalScore -= hintCost;
  updateScoreUI();
  
  playScribbleSound();

  // Pick a random unfound word
  const randWordIdx = unfoundIndices[Math.floor(Math.random() * unfoundIndices.length)];
  const targetWord = subwords[randWordIdx];

  // Find which letter indices of this word are NOT yet revealed by hints
  const alreadyRevealed = gameState.hintsRevealed[randWordIdx] || [];
  const unrevealedLetterIndices = [];
  
  for (let i = 0; i < targetWord.length; i++) {
    if (!alreadyRevealed.includes(i)) {
      unrevealedLetterIndices.push(i);
    }
  }

  // Pick a letter to reveal
  if (unrevealedLetterIndices.length > 0) {
    const randLetterIdx = unrevealedLetterIndices[Math.floor(Math.random() * unrevealedLetterIndices.length)];
    
    if (!gameState.hintsRevealed[randWordIdx]) {
      gameState.hintsRevealed[randWordIdx] = [];
    }
    gameState.hintsRevealed[randWordIdx].push(randLetterIdx);

    // If this reveals the final letter of the word, we don't automatically submit it,
    // but the player can see it easily. Let's update the grid to draw this letter.
    setupLevelUI();
    saveGameState();
    
    triggerBoxyEmotion('happy');
    boxySpeak(`Scribbled a hint in a ${targetWord.length}-letter word!`, 3000);
  }
}

// --- BOXY CHEERING & TEXT LOGIC ---
function triggerBoxyEmotion(emotion) {
  const mascot = document.getElementById('boxy-mascot');
  mascot.className = `boxy-mascot ${emotion}`;
  
  const mouth = mascot.querySelector('.box-mouth');
  mouth.className = 'box-mouth'; // reset
  
  if (emotion === 'happy') {
    mouth.classList.add('smile');
  } else if (emotion === 'sad') {
    mouth.classList.add('sad-mouth');
    // Briefly return to idle after a while
    setTimeout(() => {
      if (mascot.classList.contains('sad')) {
        triggerBoxyEmotion('idle');
      }
    }, 3000);
  } else if (emotion === 'dizzy') {
    mouth.classList.add('o-mouth');
    setTimeout(() => {
      if (mascot.classList.contains('dizzy')) {
        triggerBoxyEmotion('idle');
      }
    }, 2500);
  } else {
    mouth.classList.add('smile');
  }
}

function boxySpeak(text, duration = 3000) {
  const bubble = document.getElementById('boxy-bubble');
  const bubbleText = document.getElementById('boxy-bubble-text');
  
  bubbleText.textContent = text;
  bubble.classList.remove('hidden');
  
  // Clear any existing timeouts to hide bubble
  if (bubble.hideTimeout) {
    clearTimeout(bubble.hideTimeout);
  }
  
  bubble.hideTimeout = setTimeout(() => {
    bubble.classList.add('hidden');
  }, duration);
}

function startMascotIdleChatter() {
  if (mascotIdleTimer) clearInterval(mascotIdleTimer);
  
  const idleComments = [
    "Phew, spelling is hard work!",
    "Do you need a hint? Just click below!",
    "My cardboard flaps are twitching!",
    "Try shuffling the wheel for new ideas!",
    "Is there a 5-letter word in there?",
    "You are doing a splendid job!",
    "Cardboard boxes are the best shapes!",
    "N-1 represents the shrinking size of our starter words!",
    "Keep crafting, paper wizard!",
    "Can you find the anagrams?"
  ];

  mascotIdleTimer = setInterval(() => {
    // Only speak if boxy is currently idle and speech bubble is hidden
    const mascot = document.getElementById('boxy-mascot');
    const bubble = document.getElementById('boxy-bubble');
    
    if (mascot.classList.contains('idle') && bubble.classList.contains('hidden')) {
      const randComment = idleComments[Math.floor(Math.random() * idleComments.length)];
      boxySpeak(randComment, 4000);
      
      // Do a tiny hop
      mascot.style.transform = 'translateY(-5px)';
      setTimeout(() => mascot.style.transform = '', 200);
    }
  }, 24000); // every 24 seconds
}

// --- MODALS ---
function showHelp() {
  playTapSound();
  document.getElementById('help-modal').classList.remove('hidden');
}

function hideHelp() {
  playTapSound();
  document.getElementById('help-modal').classList.add('hidden');
}

function showResetConfirm() {
  playTapSound();
  document.getElementById('reset-modal').classList.remove('hidden');
}

function hideResetConfirm() {
  playTapSound();
  document.getElementById('reset-modal').classList.add('hidden');
}

function resetGame() {
  playCrinkleSound();
  document.getElementById('reset-modal').classList.add('hidden');
  
  // Clear save data
  localStorage.removeItem('n1_gameState');
  
  // Reset local state
  gameState.totalScore = 0;
  gameState.level = 7;
  gameState.foundWords = [];
  gameState.hintsRevealed = {};
  gameState.currentWordObj = null;
  gameState.isLevelUnlocked = false;
  
  // Restart
  startNewLevel(7);
  
  triggerBoxyEmotion('idle');
  boxySpeak("Starting fresh! Level 1 (7 letters) awaits!", 4000);
}

function restartFromScratch() {
  playLevelUpSound();
  document.getElementById('victory-modal').classList.add('hidden');
  resetGame();
}

function showVictoryModal() {
  const finalScore = gameState.totalScore;
  document.getElementById('vic-final-score').textContent = finalScore;
  document.getElementById('vic-high-score').textContent = gameState.highScore;
  
  document.getElementById('victory-modal').classList.remove('hidden');
  triggerBoxyEmotion('happy');
  
  // Heavy continuous confetti
  startVictoryConfetti();
  
  // Speech
  boxySpeak("WE DID IT! CONGRATULATIONS!", 10000);
}

// --- PAPER CONFETTI PARTICLE SYSTEM ---
function initConfetti() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function triggerConfettiBurst() {
  const colors = [
    '#fca5a5', // red
    '#86efac', // green
    '#93c5fd', // blue
    '#fde047', // yellow
    '#d8b4fe', // purple
    '#ecd0a5'  // cardboard light
  ];

  // Spawn 80 scrap paper particles from Boxy's shelf location
  const shelf = document.querySelector('.mascot-shelf');
  const rect = shelf.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top;

  for (let i = 0; i < 60; i++) {
    confettiParticles.push({
      x: startX,
      y: startY,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.8) * 10 - 4, // explode upwards
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  if (!confettiAnimationId) {
    animateConfetti();
  }
}

let isVictoryConfetti = false;
function startVictoryConfetti() {
  isVictoryConfetti = true;
  triggerConfettiBurst();
  
  // Continuously spawn more confetti
  const interval = setInterval(() => {
    if (!isVictoryConfetti) {
      clearInterval(interval);
      return;
    }
    
    // Spawn at top of screen randomly
    const colors = ['#fca5a5', '#86efac', '#93c5fd', '#fde047', '#d8b4fe', '#ecd0a5'];
    for (let i = 0; i < 5; i++) {
      confettiParticles.push({
        x: Math.random() * canvas.width,
        y: -20,
        size: Math.random() * 8 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 5,
        opacity: 1
      });
    }
  }, 100);

  // Stop victory loop after 12 seconds
  setTimeout(() => {
    isVictoryConfetti = false;
  }, 12000);
}

function animateConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    
    // Gravity & physics
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.25; // gravity
    p.vx *= 0.98; // wind resistance
    p.rotation += p.rSpeed;
    
    // Fade out particles near death
    if (!isVictoryConfetti && p.vy > 2) {
      p.opacity -= 0.02;
    }
    
    // Draw scrap paper (rectangle)
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, p.opacity);
    ctx.fillStyle = p.color;
    
    // Draw rigid rough cutout box
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    // Draw marker stroke outline on paper scraps for craft look
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    
    ctx.restore();
    
    // Remove out of bounds or invisible particles
    if (p.y > canvas.height || p.opacity <= 0) {
      confettiParticles.splice(i, 1);
    }
  }
  
  if (confettiParticles.length > 0) {
    confettiAnimationId = requestAnimationFrame(animateConfetti);
  } else {
    confettiAnimationId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
