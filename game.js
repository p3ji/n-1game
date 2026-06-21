// game.js - Cardboard Word Game Logic (Single-Screen Mobile Edition)

// --- GAME STATE ---
let gameState = {
  totalScore: 0,
  level: 7, // 7 letters -> 6 letters -> 5 letters -> 4 letters
  currentWordObj: null, // { word: 'weather', subwords: [...] }
  wheelLetters: [], // current letters on the wheel (shuffled version of starter word)
  foundWords: [], // List of found words
  spelledWord: '',
  selectedTileIndices: [], // Indices of letter tiles currently selected
  soundEnabled: true,
  hintsRevealed: {}, // maps wordIndex -> array of indices of revealed letters
  isLevelUnlocked: false,
  hintsUsed: 0,
  attempts: [],
  easyMode: false
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
  loadGameState();
  loadAttempts();
  initConfetti();

  // Always start with all modals/dropdowns closed, regardless of any cached state
  ['reset-modal', 'help-modal', 'victory-modal', 'history-modal'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('settings-dropdown')?.classList.add('hidden');
  
  // Set up event listeners
  document.getElementById('btn-settings').addEventListener('click', toggleSettingsDropdown);
  document.getElementById('btn-sound').addEventListener('click', (e) => {
    toggleSound();
    hideSettingsDropdown();
  });
  document.getElementById('btn-history-icon').addEventListener('click', openHistoryModal);
  document.getElementById('btn-difficulty').addEventListener('click', (e) => {
    toggleDifficulty();
    hideSettingsDropdown();
  });
  document.getElementById('btn-help').addEventListener('click', (e) => {
    showHelp();
    hideSettingsDropdown();
  });
  document.getElementById('btn-reset').addEventListener('click', (e) => {
    e.stopPropagation();
    showResetConfirm();
    hideSettingsDropdown();
  });
  document.getElementById('btn-force-update').addEventListener('click', (e) => {
    e.stopPropagation();
    forceUpdate();
  });
  
  document.getElementById('btn-close-help').addEventListener('click', hideHelp);
  document.getElementById('btn-close-history').addEventListener('click', hideHistoryModal);
  document.getElementById('btn-clear-history').addEventListener('click', clearAttemptsHistory);
  document.getElementById('btn-cancel-reset').addEventListener('click', (e) => {
    e.stopPropagation();
    hideResetConfirm();
  });
  document.getElementById('btn-confirm-reset').addEventListener('click', (e) => {
    e.stopPropagation();
    resetGame();
  });
  document.getElementById('btn-clear').addEventListener('click', clearSpelledWord);
  document.getElementById('btn-shuffle').addEventListener('click', shuffleLetters);
  document.getElementById('btn-submit').addEventListener('click', submitSpelledWord);
  document.getElementById('btn-hint').addEventListener('click', purchaseHint);
  document.getElementById('btn-purchase').addEventListener('click', purchaseNextLevel);
  document.getElementById('btn-play-again').addEventListener('click', restartFromScratch);

  // Wheel center click to submit
  document.getElementById('wheel-center-input').addEventListener('click', () => {
    if (gameState.spelledWord.length > 0) {
      submitSpelledWord();
    }
  });

  // Close settings menu when clicking outside
  window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('settings-dropdown');
    const btnSettings = document.getElementById('btn-settings');
    if (!dropdown.classList.contains('hidden') && e.target !== btnSettings && !btnSettings.contains(e.target) && !dropdown.contains(e.target)) {
      hideSettingsDropdown();
    }
  });

  // Keyboard input
  window.addEventListener('keydown', handleKeyboardInput);

  // Resize canvas
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Start game
  if (!gameState.currentWordObj) {
    startNewLevel(gameState.level);
  } else {
    setupLevelUI();
    updateScoreUI();
    updateProgressUI();
  }

  // Boxy initial speech
  setTimeout(() => {
    boxySpeak("Hi! Let's craft words out of cardboard!", 4000);
  }, 1000);

  // Start mascot idle chatter
  startMascotIdleChatter();
});

// --- SETTINGS DROPDOWN ---
function toggleSettingsDropdown(e) {
  e.stopPropagation();
  playTapSound();
  const dropdown = document.getElementById('settings-dropdown');
  dropdown.classList.toggle('hidden');
}

function hideSettingsDropdown() {
  const dropdown = document.getElementById('settings-dropdown');
  dropdown.classList.add('hidden');
}

// --- STATE PERSISTENCE ---
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
      gameState.hintsUsed = parsed.hintsUsed || 0;
      gameState.easyMode = parsed.easyMode === true;
      
      if (parsed.currentWord) {
        const wordsList = WORDS_DATA[gameState.level] || [];
        const match = wordsList.find(w => w.word === parsed.currentWord);
        if (match) {
          gameState.currentWordObj = match;
          if (parsed.wheelLetters && parsed.wheelLetters.length === match.word.length) {
            gameState.wheelLetters = parsed.wheelLetters;
          } else {
            // Generate them by shuffling
            const chars = match.word.split('');
            for (let i = chars.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [chars[i], chars[j]] = [chars[j], chars[i]];
            }
            gameState.wheelLetters = chars;
          }
        }
      }
      
      updateSoundButtonUI();
      updateDifficultyButtonUI();
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
    wheelLetters: gameState.wheelLetters,
    foundWords: gameState.foundWords,
    hintsRevealed: gameState.hintsRevealed,
    soundEnabled: gameState.soundEnabled,
    hintsUsed: gameState.hintsUsed,
    easyMode: gameState.easyMode
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
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(110, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(35, audioCtx.currentTime + 0.12);
  
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.13);
}

function playChimeSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    const delay = idx * 0.04;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.5);
    
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + 0.55);
  });
}

function playCrinkleSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  const bufferSize = audioCtx.sampleRate * 0.2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, audioCtx.currentTime);
  filter.frequency.linearRampToValueAtTime(300, audioCtx.currentTime + 0.15);
  filter.Q.value = 3;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.04);
  gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  
  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noiseNode.start();
  noiseNode.stop(audioCtx.currentTime + 0.21);
}

function playGulpSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  const now = audioCtx.currentTime;

  // Crunch noise
  const bufferSize = audioCtx.sampleRate * 0.06;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, now);
  const gainNoise = audioCtx.createGain();
  gainNoise.gain.setValueAtTime(0.25, now);
  gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  noiseNode.connect(filter);
  filter.connect(gainNoise);
  gainNoise.connect(audioCtx.destination);
  noiseNode.start(now);
  noiseNode.stop(now + 0.07);

  // Swallow sweep
  const osc = audioCtx.createOscillator();
  const gainSwallow = audioCtx.createGain();
  osc.connect(gainSwallow);
  gainSwallow.connect(audioCtx.destination);
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, now + 0.05);
  osc.frequency.exponentialRampToValueAtTime(65, now + 0.22);
  
  gainSwallow.gain.setValueAtTime(0, now);
  gainSwallow.gain.linearRampToValueAtTime(0.35, now + 0.07);
  gainSwallow.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  
  osc.start(now + 0.05);
  osc.stop(now + 0.23);
}

function playScribbleSound() {
  if (!gameState.soundEnabled) return;
  initAudio();
  
  const duration = 0.35;
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
  filter.frequency.setValueAtTime(3200, audioCtx.currentTime);
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
  gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
  
  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noiseNode.start();
  noiseNode.stop(audioCtx.currentTime + duration);
}

function playLevelUpSound() {
  if (!gameState.soundEnabled) return;
  initAudio();

  const now = audioCtx.currentTime;
  
  // Taps
  for (let i = 0; i < 4; i++) {
    const tapTime = now + i * 0.1;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90 + i * 25, tapTime);
    gain.gain.setValueAtTime(0.35, tapTime);
    gain.gain.exponentialRampToValueAtTime(0.01, tapTime + 0.08);
    
    osc.start(tapTime);
    osc.stop(tapTime + 0.09);
  }

  // Chime sweep
  const sweepStart = now + 0.4;
  const oscSweep = audioCtx.createOscillator();
  const gainSweep = audioCtx.createGain();
  oscSweep.connect(gainSweep);
  gainSweep.connect(audioCtx.destination);
  
  oscSweep.type = 'triangle';
  oscSweep.frequency.setValueAtTime(250, sweepStart);
  oscSweep.frequency.exponentialRampToValueAtTime(1000, sweepStart + 0.45);
  
  gainSweep.gain.setValueAtTime(0, sweepStart);
  gainSweep.gain.linearRampToValueAtTime(0.3, sweepStart + 0.08);
  gainSweep.gain.exponentialRampToValueAtTime(0.001, sweepStart + 0.5);
  
  oscSweep.start(sweepStart);
  oscSweep.stop(sweepStart + 0.55);
}

function toggleSound() {
  initAudio();
  gameState.soundEnabled = !gameState.soundEnabled;
  updateSoundButtonUI();
  saveGameState();
  playTapSound();
}

function toggleDifficulty() {
  gameState.easyMode = !gameState.easyMode;
  updateDifficultyButtonUI();
  updateProgressUI();
  saveGameState();
  playTapSound();
}

function updateDifficultyButtonUI() {
  const btn = document.getElementById('btn-difficulty');
  if (btn) {
    btn.textContent = `Easy Mode: ${gameState.easyMode ? 'ON' : 'OFF'}`;
    if (gameState.easyMode) {
      btn.classList.add('btn-danger'); // Use red background to indicate it's active
    } else {
      btn.classList.remove('btn-danger');
    }
  }
}

function updateSoundButtonUI() {
  const btnSound = document.getElementById('btn-sound');
  if (gameState.soundEnabled) {
    btnSound.textContent = "Sound: ON";
    btnSound.classList.remove('btn-danger');
  } else {
    btnSound.textContent = "Sound: OFF";
    btnSound.classList.add('btn-danger');
  }
}

// --- GAME STATE & UI UPDATES ---

function startNewLevel(n) {
  gameState.level = n;
  gameState.foundWords = [];
  gameState.hintsRevealed = {};
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  gameState.isLevelUnlocked = false;
  gameState.hintsUsed = 0;
  
  const candidates = WORDS_DATA[n] || [];
  if (candidates.length === 0) {
    console.error(`No word candidates for level ${n}`);
    return;
  }
  
  const randIndex = Math.floor(Math.random() * candidates.length);
  gameState.currentWordObj = candidates[randIndex];
  
  // Scramble starter word letters initially to populate wheelLetters
  const chars = gameState.currentWordObj.word.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  gameState.wheelLetters = chars;
  
  setupLevelUI();
  updateScoreUI();
  updateProgressUI();
  saveGameState();
}

function setupLevelUI() {
  const wordObj = gameState.currentWordObj;
  if (!wordObj) return;

  document.getElementById('level-letter-count-label').textContent = `${gameState.level}-Letter Word`;
  document.getElementById('current-word-display').textContent = wordObj.word.toUpperCase();

  // Populate Mini Cardboard Boxes Row
  const grid = document.getElementById('mini-boxes-grid');
  grid.innerHTML = '';

  wordObj.subwords.forEach((subword, wordIdx) => {
    const isFound = gameState.foundWords.includes(subword);
    const revealedIndices = gameState.hintsRevealed[wordIdx] || [];
    const hasHints = revealedIndices.length > 0;
    
    // Create mini-box item
    const boxItem = document.createElement('div');
    boxItem.className = 'mini-box-item';
    boxItem.setAttribute('data-word', subword);
    boxItem.setAttribute('data-index', wordIdx);

    if (isFound) {
      boxItem.classList.add('revealed');
    } else if (hasHints) {
      boxItem.classList.add('has-hint');
    }

    // Box graphic
    const boxGraphic = document.createElement('div');
    boxGraphic.className = 'mini-box-graphic';
    boxItem.appendChild(boxGraphic);

    // Text Label showing word OR hint dashes. NO dashes if closed and not hinted!
    const wordLabel = document.createElement('span');
    wordLabel.className = 'found-word-label';
    
    if (isFound) {
      wordLabel.textContent = subword;
    } else if (hasHints) {
      // Build length dashes with revealed hint letters: e.g. "T _ _ _"
      const lettersArr = [];
      for (let i = 0; i < subword.length; i++) {
        if (revealedIndices.includes(i)) {
          lettersArr.push(subword[i].toUpperCase());
        } else {
          lettersArr.push('_');
        }
      }
      wordLabel.textContent = lettersArr.join(' ');
    } else {
      // CLOSED BOX, NOT FOUND: show absolutely no letters/dashes/hints!
      wordLabel.textContent = '';
    }
    
    boxItem.appendChild(wordLabel);
    grid.appendChild(boxItem);
  });

  // Render Letter Wheel
  renderLetterWheel();

  // Update shop/progression text
  const nextSize = gameState.level - 1;
  const shopTitle = document.getElementById('shop-item-name');
  
  if (nextSize >= 4) {
    shopTitle.textContent = `${nextSize}-Letter Word`;
  } else {
    shopTitle.textContent = `Claim Victory!`;
  }

  // Clear typed display
  updateTypedDisplay();
  
  // Make sure selection classes are synced on the new tiles
  updateTileSelectionUI();

  // Update hints counter button state
  updateHintButtonUI();

  // Update Boxy's friends visibility surrounding the wheel
  updateFriendsUI();
}

function renderLetterWheel() {
  const wheel = document.getElementById('letter-wheel');
  // Clear old letter tiles
  const tiles = wheel.querySelectorAll('.wheel-letter-tile');
  tiles.forEach(tile => tile.remove());

  const chars = gameState.wheelLetters;
  if (!chars || chars.length === 0) return;
  
  const radius = 75; // px (fits 210px container)
  const center = 105; // half of 210px
  
  chars.forEach((char, idx) => {
    const tile = document.createElement('div');
    tile.className = 'wheel-letter-tile';
    tile.textContent = char;
    tile.setAttribute('data-index', idx);
    tile.setAttribute('data-char', char);
    
    const angle = (idx / chars.length) * 2 * Math.PI - Math.PI / 2;
    const x = center + radius * Math.cos(angle) - 20;
    const y = center + radius * Math.sin(angle) - 20;
    
    tile.style.left = `${x}px`;
    tile.style.top = `${y}px`;
    
    tile.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent triggering wheel center submit
      handleTileClick(idx);
    });
    
    wheel.appendChild(tile);
  });
}

function handleTileClick(idx) {
  const char = gameState.wheelLetters[idx];
  
  const selectedIdx = gameState.selectedTileIndices.indexOf(idx);
  if (selectedIdx !== -1) {
    playTapSound();
    gameState.selectedTileIndices.splice(selectedIdx, 1);
    gameState.spelledWord = gameState.selectedTileIndices.map(i => gameState.wheelLetters[i]).join('');
    updateTileSelectionUI();
    updateTypedDisplay();
  } else {
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
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  updateTypedDisplay();

  const chars = [...gameState.wheelLetters];
  
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  
  gameState.wheelLetters = chars;
  renderLetterWheel();
  saveGameState();
  
  triggerBoxyEmotion('idle');
  boxySpeak("Mixed up the cardboard!", 2000);
}

// --- SUBMIT & EATING ANIMATION ---
function submitSpelledWord() {
  const word = gameState.spelledWord.trim().toLowerCase();
  if (word.length < 3) {
    if (word.length > 0) {
      triggerBoxyEmotion('sad');
      boxySpeak("Must be 3+ letters!", 2000);
      playCrinkleSound();
    }
    return;
  }

  const subwords = gameState.currentWordObj.subwords;
  const isFound = gameState.foundWords.includes(word);
  const isValid = subwords.includes(word);

  if (isFound) {
    triggerBoxyEmotion('dizzy');
    boxySpeak(`Found "${word.toUpperCase()}" already!`, 2500);
    playCrinkleSound();
    shakeWheelCenter();
  } else if (isValid) {
    // Correct word! Animate flying text to Boxy's mouth
    animateEatingScrap(word);
  } else {
    // Invalid word
    triggerBoxyEmotion('sad');
    const comments = ["Not in my box!", "Is that a word?", "Try again!", "Nope!"];
    const randComment = comments[Math.floor(Math.random() * comments.length)];
    boxySpeak(randComment, 2500);
    playCrinkleSound();
    shakeWheelCenter();
  }
}

function shakeWheelCenter() {
  const centerInput = document.getElementById('wheel-center-input');
  centerInput.classList.add('shake-center');
  centerInput.addEventListener('animationend', () => {
    centerInput.classList.remove('shake-center');
  }, { once: true });
}

// Inject shake-center keyframe
const style = document.createElement('style');
style.textContent = `
  @keyframes shake-ctr {
    0%, 100% { transform: scale(1) translateX(0); }
    20%, 60% { transform: scale(1) translateX(-5px); }
    40%, 80% { transform: scale(1) translateX(5px); }
  }
  .shake-center {
    animation: shake-ctr 0.3s ease-in-out;
  }
`;
document.head.appendChild(style);

function animateEatingScrap(word) {
  const typedWord = word;
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  updateTileSelectionUI();
  updateTypedDisplay();

  // Get coordinates
  const wheelCenter = document.getElementById('wheel-center-input');
  const wheelRect = wheelCenter.getBoundingClientRect();
  const startX = wheelRect.left + wheelRect.width / 2;
  const startY = wheelRect.top + wheelRect.height / 2;

  const mouth = document.querySelector('#boxy-mascot .box-mouth');
  const mouthRect = mouth.getBoundingClientRect();
  const endX = mouthRect.left + mouthRect.width / 2;
  const endY = mouthRect.top + mouthRect.height / 2;

  // Create flying scrap element
  const scrap = document.createElement('div');
  scrap.className = 'flying-word-scrap';
  scrap.textContent = typedWord;
  scrap.style.left = `${startX}px`;
  scrap.style.top = `${startY}px`;
  scrap.style.transform = 'translate(-50%, -50%)';
  document.body.appendChild(scrap);

  // Set Boxy mouth wide open for eating
  triggerBoxyEmotion('idle');
  const mouthEl = document.querySelector('#boxy-mascot .box-mouth');
  mouthEl.className = 'box-mouth o-mouth';

  // Fly animation
  const animation = scrap.animate([
    {
      left: `${startX}px`,
      top: `${startY}px`,
      transform: 'translate(-50%, -50%) scale(1) rotate(0deg)'
    },
    {
      left: `${endX}px`,
      top: `${endY}px`,
      transform: 'translate(-50%, -50%) scale(0.15) rotate(720deg)'
    }
  ], {
    duration: 550,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  });

  animation.onfinish = () => {
    scrap.remove();

    // Boxy gulps
    playGulpSound();
    triggerBoxyEmotion('happy');
    
    // Squash/stretch
    const body = document.querySelector('#boxy-mascot .boxy-body');
    body.style.transform = 'scale(1.2, 0.8)';
    setTimeout(() => {
      body.style.transform = 'scale(0.8, 1.2)';
      setTimeout(() => {
        body.style.transform = '';
      }, 150);
    }, 150);

    // Save word
    gameState.foundWords.push(typedWord);
    
    // Increment total words gotten
    gameState.totalScore += 1;
    
    const compliments = ["Yum! Splendid!", "Gulp! Delicious!", "Tasty spelling!", "Crunchy word!", "Perfect!", "Ate it!"];
    const randComp = compliments[Math.floor(Math.random() * compliments.length)];
    boxySpeak(`${randComp} +1 word`, 3000);

    // Reveal mini box
    revealMiniBox(typedWord);

    // Confetti burst
    triggerConfettiBurst();

    updateScoreUI();
    updateProgressUI();
    saveGameState();

    // Check level completed
    checkDirectVictory();
  };
}

function revealMiniBox(word) {
  const item = document.querySelector(`.mini-box-item[data-word="${word}"]`);
  if (item) {
    item.classList.remove('has-hint');
    item.classList.add('revealed');
    
    // Reveal text label
    const label = item.querySelector('.found-word-label');
    label.textContent = word;
    
    // Bounce
    item.style.transform = 'scale(1.25)';
    item.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.6)';
    setTimeout(() => {
      item.style.transform = '';
    }, 300);
  }
}

// --- KEYBOARD INPUTS ---
function handleKeyboardInput(e) {
  const key = e.key.toLowerCase();
  
  if (!document.getElementById('help-modal').classList.contains('hidden') ||
      !document.getElementById('victory-modal').classList.contains('hidden') ||
      !document.getElementById('reset-modal').classList.contains('hidden')) {
    return;
  }

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

  if (e.key === 'Enter') {
    e.preventDefault();
    submitSpelledWord();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    clearSpelledWord();
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    shuffleLetters();
    return;
  }

  if (/^[a-z]$/.test(key)) {
    const starterWord = gameState.currentWordObj.word;
    const getLetterCounts = (str) => {
      const counts = {};
      for (const c of str) counts[c] = (counts[c] || 0) + 1;
      return counts;
    };
    
    const starterCounts = getLetterCounts(starterWord);
    const spelledCounts = getLetterCounts(gameState.spelledWord);
    
    if (starterCounts[key] && (spelledCounts[key] || 0) < starterCounts[key]) {
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
      triggerBoxyEmotion('sad');
      playTapSound();
    }
  }
}

// --- SHOP & PROGRESSION ---
function updateScoreUI() {
  document.getElementById('total-score').textContent = gameState.totalScore;
}

function updateProgressUI() {
  const W = gameState.currentWordObj.subwords.length;
  const foundCount = gameState.foundWords.length;
  
  document.getElementById('words-found-count').textContent = `${foundCount} / ${W}`;
  
  const progressPercent = Math.min(100, (foundCount / W) * 100);
  const progressBar = document.getElementById('words-progress-bar');
  progressBar.style.width = `${progressPercent}%`;
  
  const goalCount = gameState.easyMode ? Math.max(1, Math.ceil(W / 2)) : Math.max(1, W - 1);
  const goalPercent = (goalCount / W) * 100;
  
  const goalMarker = document.getElementById('goal-marker');
  goalMarker.style.left = `${goalPercent}%`;
  
  const needed = goalCount - foundCount;
  const purchaseButton = document.getElementById('btn-purchase');

  if (needed > 0) {
    purchaseButton.classList.remove('ready');
    purchaseButton.classList.add('disabled');
    purchaseButton.disabled = true;
    purchaseButton.textContent = "LOCKED";
  } else {
    purchaseButton.classList.add('ready');
    purchaseButton.classList.remove('disabled');
    purchaseButton.disabled = false;
    
    if (gameState.level === 4) {
      purchaseButton.textContent = "WIN";
    } else {
      purchaseButton.textContent = "PROCEED";
    }
    
    if (!gameState.isLevelUnlocked) {
      gameState.isLevelUnlocked = true;
      triggerBoxyEmotion('happy');
      boxySpeak("The next word package is unlocked!", 4000);
    }
  }
}

function purchaseNextLevel() {
  const W = gameState.currentWordObj.subwords.length;
  const goalCount = gameState.easyMode ? Math.max(1, Math.ceil(W / 2)) : Math.max(1, W - 1);
  if (gameState.foundWords.length < goalCount) {
    playCrinkleSound();
    return;
  }

  // Record this completed package in history
  recordCurrentAttempt();

  playLevelUpSound();
  
  const nextLevel = gameState.level - 1;
  gameState.isLevelUnlocked = false;

  if (nextLevel < 4) {
    showVictoryModal();
  } else {
    boxySpeak(`Unlocked! Loading ${nextLevel}-letter word!`, 4000);
    triggerBoxyEmotion('happy');
    startNewLevel(nextLevel);
  }
}

function checkDirectVictory() {
  const W = gameState.currentWordObj.subwords.length;
  const found = gameState.foundWords.length;
  const goalCount = gameState.easyMode ? Math.max(1, Math.ceil(W / 2)) : Math.max(1, W - 1);
  
  if (gameState.level === 4 && found >= goalCount) {
    const purchaseButton = document.getElementById('btn-purchase');
    purchaseButton.textContent = "VICTORY";
    purchaseButton.classList.add('ready');
    purchaseButton.classList.remove('disabled');
    purchaseButton.disabled = false;
    
    if (found === W) {
      recordCurrentAttempt(); // Record final 100% completion in history
      showVictoryModal();
    }
  }
}

// --- HINTS ---
function updateHintButtonUI() {
  const btnHint = document.getElementById('btn-hint');
  if (!btnHint) return;

  const left = Math.max(0, 3 - (gameState.hintsUsed || 0));
  btnHint.textContent = `GET HINT (${left} left)`;

  if (left <= 0) {
    btnHint.classList.add('disabled');
    btnHint.disabled = true;
  } else {
    btnHint.classList.remove('disabled');
    btnHint.disabled = false;
  }
}

function updateFriendsUI() {
  const roxy = document.getElementById('friend-roxy');
  const toxy = document.getElementById('friend-toxy');
  const foxy = document.getElementById('friend-foxy');
  if (!roxy || !toxy || !foxy) return;

  const used = gameState.hintsUsed || 0;
  if (used >= 1) roxy.classList.add('leaving');
  else roxy.classList.remove('leaving');

  if (used >= 2) toxy.classList.add('leaving');
  else toxy.classList.remove('leaving');

  if (used >= 3) foxy.classList.add('leaving');
  else foxy.classList.remove('leaving');
}

function purchaseHint() {
  if ((gameState.hintsUsed || 0) >= 3) {
    boxySpeak("No more hints for this word!", 3000);
    playCrinkleSound();
    return;
  }

  const subwords = gameState.currentWordObj.subwords;
  const unfoundIndices = [];
  subwords.forEach((word, wordIdx) => {
    if (!gameState.foundWords.includes(word)) {
      unfoundIndices.push(wordIdx);
    }
  });

  if (unfoundIndices.length === 0) {
    boxySpeak("All words found!", 3500);
    playCrinkleSound();
    return;
  }

  playScribbleSound();

  const randWordIdx = unfoundIndices[Math.floor(Math.random() * unfoundIndices.length)];
  const targetWord = subwords[randWordIdx];

  const alreadyRevealed = gameState.hintsRevealed[randWordIdx] || [];
  const unrevealedLetterIndices = [];
  for (let i = 0; i < targetWord.length; i++) {
    if (!alreadyRevealed.includes(i)) {
      unrevealedLetterIndices.push(i);
    }
  }

  if (unrevealedLetterIndices.length > 0) {
    const randLetterIdx = unrevealedLetterIndices[Math.floor(Math.random() * unrevealedLetterIndices.length)];
    if (!gameState.hintsRevealed[randWordIdx]) {
      gameState.hintsRevealed[randWordIdx] = [];
    }
    gameState.hintsRevealed[randWordIdx].push(randLetterIdx);

    const friends = [
      "Roxy (the mailing tube)",
      "Toxy (the triangular box)",
      "Foxy (the flat pizza box)"
    ];
    const helperFriend = friends[gameState.hintsUsed || 0] || "Roxy (the mailing tube)";
    gameState.hintsUsed = (gameState.hintsUsed || 0) + 1;

    setupLevelUI();
    saveGameState();
    
    triggerBoxyEmotion('happy');
    boxySpeak(`${helperFriend} helped and revealed a letter!`, 4000);
  }
}

// --- BOXY CHAT & EMOTIONS ---
function triggerBoxyEmotion(emotion) {
  const mascot = document.getElementById('boxy-mascot');
  mascot.className = `boxy-mascot ${emotion}`;
  const mouth = mascot.querySelector('.box-mouth');
  mouth.className = 'box-mouth';
  
  if (emotion === 'happy') {
    mouth.classList.add('smile');
  } else if (emotion === 'sad') {
    mouth.classList.add('sad-mouth');
    setTimeout(() => {
      if (mascot.classList.contains('sad')) triggerBoxyEmotion('idle');
    }, 3000);
  } else if (emotion === 'dizzy') {
    mouth.classList.add('o-mouth');
    setTimeout(() => {
      if (mascot.classList.contains('dizzy')) triggerBoxyEmotion('idle');
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
  
  if (bubble.hideTimeout) clearTimeout(bubble.hideTimeout);
  bubble.hideTimeout = setTimeout(() => {
    bubble.classList.add('hidden');
  }, duration);
}

function startMascotIdleChatter() {
  if (mascotIdleTimer) clearInterval(mascotIdleTimer);
  const idleComments = [
    "Spelling is fun!",
    "Need a hint? Click below!",
    "My cardboard box feels cozy!",
    "Try shuffling the wheel!",
    "Tap the center of the wheel to submit!",
    "You are doing a splendid job!",
    "Boxy likes clean cardboard!",
    "We need W-1 words to unlock!",
    "Can you find the anagrams?"
  ];

  mascotIdleTimer = setInterval(() => {
    const mascot = document.getElementById('boxy-mascot');
    const bubble = document.getElementById('boxy-bubble');
    if (mascot.classList.contains('idle') && bubble.classList.contains('hidden')) {
      const randComment = idleComments[Math.floor(Math.random() * idleComments.length)];
      boxySpeak(randComment, 4000);
      mascot.style.transform = 'translateY(-4px)';
      setTimeout(() => mascot.style.transform = '', 200);
    }
  }, 22000);
}

// --- MODALS ---
function showHelp() {
  playTapSound();
  const modal = document.getElementById('help-modal');
  modal.classList.remove('hidden');
  // Clicking backdrop closes it
  modal.onclick = (e) => { if (e.target === modal) hideHelp(); };
}
function hideHelp() {
  playTapSound();
  document.getElementById('help-modal').classList.add('hidden');
}
function showResetConfirm() {
  playTapSound();
  const modal = document.getElementById('reset-modal');
  modal.classList.remove('hidden');
  // Clicking backdrop closes it
  modal.onclick = (e) => { if (e.target === modal) hideResetConfirm(); };
}
function hideResetConfirm() {
  playTapSound();
  document.getElementById('reset-modal').classList.add('hidden');
}
function forceUpdate() {
  boxySpeak('Refreshing cardboard...', 3000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      Promise.all(regs.map(r => r.unregister())).then(() => {
        // Clear all caches
        caches.keys().then(keys =>
          Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => window.location.reload(true));
      });
    });
  } else {
    window.location.reload(true);
  }
}
function resetGame() {
  playCrinkleSound();
  document.getElementById('reset-modal').classList.add('hidden');
  localStorage.removeItem('n1_gameState');
  
  gameState.totalScore = 0;
  gameState.level = 7;
  gameState.foundWords = [];
  gameState.hintsRevealed = {};
  gameState.currentWordObj = null;
  gameState.isLevelUnlocked = false;
  
  startNewLevel(7);
  triggerBoxyEmotion('idle');
  boxySpeak("Started fresh cardboard! Level 1!", 4000);
}
function restartFromScratch() {
  playLevelUpSound();
  document.getElementById('victory-modal').classList.add('hidden');
  resetGame();
}
function showVictoryModal() {
  const finalScore = gameState.totalScore;
  document.getElementById('vic-final-score').textContent = finalScore;
  document.getElementById('victory-modal').classList.remove('hidden');
  triggerBoxyEmotion('happy');
  startVictoryConfetti();
  boxySpeak("VICTORY! We cleared it!", 10000);
}

// --- PARTICLE CONFETTI ---
function initConfetti() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function triggerConfettiBurst() {
  const colors = ['#fca5a5', '#86efac', '#93c5fd', '#fde047', '#d8b4fe', '#ecd0a5'];
  const mascot = document.getElementById('boxy-mascot');
  const rect = mascot.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top;

  for (let i = 0; i < 45; i++) {
    confettiParticles.push({
      x: startX,
      y: startY,
      size: Math.random() * 6 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.75) * 8 - 3,
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 8,
      opacity: 1
    });
  }

  if (!confettiAnimationId) animateConfetti();
}

let isVictoryConfetti = false;
function startVictoryConfetti() {
  isVictoryConfetti = true;
  triggerConfettiBurst();
  
  const interval = setInterval(() => {
    if (!isVictoryConfetti) {
      clearInterval(interval);
      return;
    }
    const colors = ['#fca5a5', '#86efac', '#93c5fd', '#fde047', '#d8b4fe', '#ecd0a5'];
    for (let i = 0; i < 4; i++) {
      confettiParticles.push({
        x: Math.random() * canvas.width,
        y: -15,
        size: Math.random() * 6 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 4,
        opacity: 1
      });
    }
  }, 120);

  setTimeout(() => { isVictoryConfetti = false; }, 10000);
}

function animateConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.98;
    p.rotation += p.rSpeed;
    
    if (!isVictoryConfetti && p.vy > 1.5) p.opacity -= 0.025;
    
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, p.opacity);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.75);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.75);
    ctx.restore();
    
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

// --- ATTEMPTS HISTORY ---
function saveAttempts() {
  localStorage.setItem('n1_attempts', JSON.stringify(gameState.attempts || []));
}

function loadAttempts() {
  const saved = localStorage.getItem('n1_attempts');
  if (saved) {
    try {
      gameState.attempts = JSON.parse(saved) || [];
    } catch(e) {
      console.error('Failed to parse saved attempts', e);
      gameState.attempts = [];
    }
  } else {
    gameState.attempts = [];
  }
}

function recordCurrentAttempt() {
  if (!gameState.currentWordObj) return;

  const lastAttempt = gameState.attempts[gameState.attempts.length - 1];
  if (lastAttempt && 
      lastAttempt.starterWord === gameState.currentWordObj.word && 
      lastAttempt.foundCount === gameState.foundWords.length) {
    return;
  }

  const attempt = {
    starterWord: gameState.currentWordObj.word,
    level: gameState.level,
    foundCount: gameState.foundWords.length,
    totalCount: gameState.currentWordObj.subwords.length,
    timestamp: new Date().toISOString()
  };

  if (!gameState.attempts) {
    gameState.attempts = [];
  }
  gameState.attempts.push(attempt);
  saveAttempts();
}

function openHistoryModal() {
  playTapSound();
  document.getElementById('settings-dropdown').classList.add('hidden');
  
  const listContainer = document.getElementById('history-list-container');
  listContainer.innerHTML = '';

  const attempts = gameState.attempts || [];
  if (attempts.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'history-empty-msg';
    emptyMsg.textContent = "No cardboard word packages completed yet! Start spelling to make history.";
    listContainer.appendChild(emptyMsg);
  } else {
    // Sort from newest to oldest
    const sorted = [...attempts].reverse();
    sorted.forEach(att => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const date = new Date(att.timestamp);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      item.innerHTML = `
        <div class="history-item-left">
          <span class="history-word">${att.starterWord.toUpperCase()}</span>
          <span class="history-level-label">Level ${8 - att.level} (${att.level}L)</span>
        </div>
        <div class="history-item-mid">
          <span class="history-words-count">${att.foundCount}/${att.totalCount}</span>
        </div>
        <div class="history-item-right">
          <span class="history-date">${dateStr}</span>
        </div>
      `;
      listContainer.appendChild(item);
    });
  }

  document.getElementById('history-modal').classList.remove('hidden');
}

function hideHistoryModal() {
  playTapSound();
  document.getElementById('history-modal').classList.add('hidden');
}

function clearAttemptsHistory() {
  playCrinkleSound();
  if (confirm("Are you sure you want to reset your entire attempt history?")) {
    gameState.attempts = [];
    saveAttempts();
    openHistoryModal(); // refresh UI
  }
}
