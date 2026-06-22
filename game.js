// game.js - Cardboard Word Game Logic (Single-Screen Mobile Edition)

// --- SUPABASE CONFIGURATION ---
// Please fill in your Supabase credentials here:
const SUPABASE_URL = "https://wvzxkaaauxnqqubvebcp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2enhrYWFhdXhucXF1YnZlYmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTg4OTUsImV4cCI6MjA5NzU5NDg5NX0.y44sxNqAwjXe4u2BdqaZ5cXQkPO497usoyC9tIRxxX8";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- GAME STATE ---
let gameState = {
  totalScore: 0,
  level: 4, // 4 letters -> 5 letters -> 6 letters -> 7 letters
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
  easyMode: false,
  timeLeft: 120,
  bonusCount: 0,
  bonusClaimedCurrentLevel: false,
  isTransitioning: false,
  activeBoxWords: [],
  isPlaying: false
};

// Track the auto-proceed timeout so we can cancel stale ones
let autoProceedTimeout = null;

// Audio variables
let audioCtx = null;

// Confetti variables
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let confettiParticles = [];
let confettiAnimationId = null;

// Mascot idle interval
let mascotIdleTimer = null;

// PWA Install Event Capturer
let deferredPrompt = null;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  loadGameState();
  loadAttempts();
  initConfetti();

  // Always start with all modals/dropdowns closed, regardless of any cached state
  ['reset-modal', 'help-modal', 'victory-modal', 'history-modal', 'leaderboard-modal'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('settings-dropdown')?.classList.add('hidden');
  
  // If there is an active saved game, don't show the home screen overlay
  const savedStateExists = localStorage.getItem('n1_gameState') !== null;
  if (savedStateExists && gameState.isPlaying && gameState.timeLeft > 0) {
    document.getElementById('home-screen')?.classList.add('hidden');
  } else {
    document.getElementById('home-screen')?.classList.remove('hidden');
  }
  
  // Set up event listeners
  document.getElementById('btn-settings').addEventListener('click', toggleSettingsDropdown);
  document.getElementById('btn-sound').addEventListener('click', (e) => {
    toggleSound();
    hideSettingsDropdown();
  });
  document.getElementById('btn-leaderboard-icon').addEventListener('click', openLeaderboardModal);
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
  document.getElementById('btn-close-leaderboard').addEventListener('click', hideLeaderboardModal);
  document.getElementById('tab-leaderboard-today').addEventListener('click', () => switchLeaderboardTab('today'));
  document.getElementById('tab-leaderboard-alltime').addEventListener('click', () => switchLeaderboardTab('alltime'));
  document.getElementById('btn-submit-score').addEventListener('click', submitHighScore);
  document.getElementById('player-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitHighScore();
    }
  });

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
  document.getElementById('btn-play-again').addEventListener('click', restartFromScratch);
  document.getElementById('btn-next-level').addEventListener('click', handleProceedToNextLevel);

  // Home screen handlers
  document.getElementById('btn-start-game').addEventListener('click', () => {
    playTapSound();
    document.getElementById('home-screen').classList.add('hidden');

    // Dismiss any stale victory modal that might be underneath
    document.getElementById('victory-modal')?.classList.add('hidden');

    // Reset all game state variables to start a completely new game session
    gameState.totalScore = 0;
    gameState.level = 4;
    gameState.foundWords = [];
    gameState.hintsRevealed = {};
    gameState.hintsUsed = 0;
    gameState.currentWordObj = null;
    gameState.isLevelUnlocked = false;
    gameState.timeLeft = 120;
    gameState.bonusCount = 0;
    gameState.bonusClaimedCurrentLevel = false;
    gameState.isTransitioning = false;
    gameState.isPlaying = true;
    if (autoProceedTimeout) {
      clearTimeout(autoProceedTimeout);
      autoProceedTimeout = null;
    }

    // Select a fresh Level 1 word (4 letters) and reset game UI
    startNewLevel(4);

    updateTimerUI();
    updateBonusUI();
    startTimerLoop();
    saveGameState();
  });
  document.getElementById('home-btn-difficulty').addEventListener('click', () => {
    toggleDifficulty();
  });

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
    updateBonusUI();
  }

  // Initialize timer loop and update UI
  startTimerLoop();
  updateTimerUI();
  updateBonusUI();

  if (gameState.timeLeft <= 0) {
    // If the session has already expired on load, don't auto-end —
    // the home screen is showing and START will reset the timer.
    // Just make sure the timer shows 0:00 and the loop isn't running.
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    updateTimerUI();
  } else {
    // Boxy initial speech
    setTimeout(() => {
      boxySpeak("Hi! Let's craft words out of cardboard!", 4000);
    }, 1000);

    // Start mascot idle chatter
    startMascotIdleChatter();
  }

  // PWA Install Prompt Handlers
  const installBanner = document.getElementById('pwa-install-banner');
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  const btnPwaDismiss = document.getElementById('btn-pwa-dismiss');

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      playTapSound();
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User choice outcome: ${outcome}`);
      } catch (err) {
        console.warn("PWA prompt failed:", err);
      }
      deferredPrompt = null;
      if (installBanner) {
        installBanner.classList.add('hidden');
      }
    });
  }

  if (btnPwaDismiss) {
    btnPwaDismiss.addEventListener('click', () => {
      playTapSound();
      localStorage.setItem('n1_pwa_dismissed', 'true');
      if (installBanner) {
        installBanner.classList.add('hidden');
      }
    });
  }

  // Check iOS custom PWA prompt
  checkPWAInstallPrompt();
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
      gameState.level = parsed.level || 4;
      gameState.foundWords = parsed.foundWords || [];
      
      // Migration check: If they loaded a level 7 state with no found words,
      // reset them to start at Level 4 (4-letter starter) since we inverted progression
      if (gameState.level > 6 && gameState.foundWords.length === 0) {
        gameState.level = 4;
        parsed.currentWord = null;
      }
      gameState.hintsRevealed = parsed.hintsRevealed || {};
      gameState.soundEnabled = parsed.soundEnabled !== false;
      gameState.hintsUsed = parsed.hintsUsed || 0;
      gameState.easyMode = parsed.easyMode === true;
      gameState.timeLeft = typeof parsed.timeLeft !== 'undefined' ? parsed.timeLeft : 120;
      gameState.bonusCount = parsed.bonusCount || 0;
      gameState.bonusClaimedCurrentLevel = parsed.bonusClaimedCurrentLevel === true;
      gameState.bonusWord = parsed.bonusWord || null;
      
      gameState.activeBoxWords = parsed.activeBoxWords || [];
      gameState.isPlaying = parsed.isPlaying === true;
      
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

      // Re-generate bonus word if missing but currentWordObj is present
      if (!gameState.bonusWord && gameState.currentWordObj) {
        selectBonusWordForLevel();
      }
      
      updateSoundButtonUI();
      updateDifficultyButtonUI();
      updateBonusUI();
      if (gameState.currentWordObj) {
        updateFriendsUI();
        updateHintButtonUI();
      }
    } catch (e) {
      console.error('Failed to parse saved game state', e);
    }
  }
}

function saveGameState() {
  // If the welcome screen is visible, do not save state to localStorage because the user hasn't started playing yet!
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen && !homeScreen.classList.contains('hidden')) {
    return;
  }

  const stateToSave = {
    totalScore: gameState.totalScore,
    level: gameState.level,
    currentWord: gameState.currentWordObj ? gameState.currentWordObj.word : null,
    wheelLetters: gameState.wheelLetters,
    foundWords: gameState.foundWords,
    hintsRevealed: gameState.hintsRevealed,
    soundEnabled: gameState.soundEnabled,
    hintsUsed: gameState.hintsUsed,
    easyMode: gameState.easyMode,
    timeLeft: gameState.timeLeft,
    bonusCount: gameState.bonusCount,
    bonusClaimedCurrentLevel: gameState.bonusClaimedCurrentLevel,
    bonusWord: gameState.bonusWord,
    activeBoxWords: gameState.activeBoxWords,
    isPlaying: gameState.isPlaying
  };
  localStorage.setItem('n1_gameState', JSON.stringify(stateToSave));
}

// --- SOUND SYNTHESIS ENGINE (Web Audio API) ---
function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(err => {
        console.warn("Failed to resume AudioContext:", err);
      });
    }
  } catch (err) {
    console.warn("AudioContext initialization failed:", err);
    audioCtx = null;
  }
}

function playTapSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    
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
  } catch (err) {
    console.warn("Error playing tap sound:", err);
  }
}

function playChimeSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

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
  } catch (err) {
    console.warn("Error playing chime sound:", err);
  }
}

function playCrinkleSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

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
  } catch (err) {
    console.warn("Error playing crinkle sound:", err);
  }
}

function playGulpSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

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
  } catch (err) {
    console.warn("Error playing gulp sound:", err);
  }
}

function playScribbleSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    
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
  } catch (err) {
    console.warn("Error playing scribble sound:", err);
  }
}

function playLevelUpSound() {
  if (!gameState.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

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
  } catch (err) {
    console.warn("Error playing level up sound:", err);
  }
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
  const ids = ['btn-difficulty', 'home-btn-difficulty'];
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.textContent = `Easy Mode: ${gameState.easyMode ? 'ON' : 'OFF'}`;
      if (gameState.easyMode) {
        btn.classList.add('btn-danger'); // Use red background to indicate it's active
      } else {
        btn.classList.remove('btn-danger');
      }
    }
  });

  const ruleCount = document.getElementById('home-rule-count');
  if (ruleCount) {
    ruleCount.textContent = gameState.easyMode ? '2' : '1';
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
  gameState.bonusClaimedCurrentLevel = false;
  
  const candidates = WORDS_DATA[n] || [];
  if (candidates.length === 0) {
    console.error(`No word candidates for level ${n}`);
    return;
  }
  
  const randIndex = Math.floor(Math.random() * candidates.length);
  gameState.currentWordObj = candidates[randIndex];
  
  // Initialize activeBoxWords
  const subwords = gameState.currentWordObj.subwords || [];
  if (subwords.length <= 12) {
    gameState.activeBoxWords = [...subwords];
  } else {
    gameState.activeBoxWords = Array(12).fill(null);
  }

  // Select the bonus word for the level
  selectBonusWordForLevel();
  
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

function selectBonusWordForLevel() {
  if (!gameState.currentWordObj || !gameState.currentWordObj.subwords) {
    gameState.bonusWord = null;
    return;
  }
  const subwords = gameState.currentWordObj.subwords;
  const starterWord = gameState.currentWordObj.word.toLowerCase();
  
  // Filter subwords that are NOT the starter word itself
  const filteredSubwords = subwords.filter(w => w.toLowerCase() !== starterWord);
  
  if (filteredSubwords.length > 0) {
    // Find the maximum length among the filtered subwords
    const maxLength = Math.max(...filteredSubwords.map(w => w.length));
    // Find all subwords with that maximum length
    const candidates = filteredSubwords.filter(w => w.length === maxLength);
    // Randomly select one candidate to be the bonus word
    gameState.bonusWord = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    gameState.bonusWord = null;
  }
}

function setupLevelUI() {
  const wordObj = gameState.currentWordObj;
  if (!wordObj) return;

  // Ensure activeBoxWords is initialized
  if (!gameState.activeBoxWords || gameState.activeBoxWords.length === 0) {
    const subwords = wordObj.subwords || [];
    if (subwords.length <= 12) {
      gameState.activeBoxWords = [...subwords];
    } else {
      gameState.activeBoxWords = Array(12).fill(null);
      let idx = 0;
      gameState.foundWords.forEach(w => {
        if (idx < 12) {
          gameState.activeBoxWords[idx] = w;
          idx++;
        }
      });
    }
  }

  const nextLevelBtn = document.getElementById('btn-next-level');
  if (nextLevelBtn) {
    nextLevelBtn.disabled = false;
    nextLevelBtn.classList.remove('disabled');
  }
  document.getElementById('next-level-btn-container')?.classList.add('hidden');

  document.getElementById('level-letter-count-label').textContent = `${gameState.level}-Letter Word`;
  document.getElementById('current-word-display').textContent = wordObj.word.toUpperCase();

  // Populate Mini Cardboard Boxes Row
  const grid = document.getElementById('mini-boxes-grid');
  grid.innerHTML = '';

  gameState.activeBoxWords.forEach((subword, wordIdx) => {
    const isFound = subword ? gameState.foundWords.includes(subword) : false;
    const revealedIndices = gameState.hintsRevealed[wordIdx] || [];
    const hasHints = revealedIndices.length > 0;
    
    // Create mini-box item
    const boxItem = document.createElement('div');
    boxItem.className = 'mini-box-item';
    boxItem.setAttribute('data-word', subword || '');
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
    } else if (hasHints && subword) {
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

  // Update shop/progression text if element exists
  const nextSize = gameState.level + 1;
  const shopTitle = document.getElementById('shop-item-name');
  if (shopTitle) {
    if (nextSize <= 7) {
      shopTitle.textContent = `${nextSize}-Letter Word`;
    } else {
      shopTitle.textContent = `Claim Victory!`;
    }
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
  if (!gameState.isPlaying) return;
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
  if (!gameState.isPlaying) return;
  playTapSound();
  gameState.spelledWord = '';
  gameState.selectedTileIndices = [];
  updateTileSelectionUI();
  updateTypedDisplay();
}

function shuffleLetters() {
  if (!gameState.isPlaying) return;
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
  if (!gameState.isPlaying) return;
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
    // Dynamic capping: assign word to first empty slot if subwords count > 12
    if (subwords.length > 12 && !gameState.activeBoxWords.includes(word)) {
      const emptyIdx = gameState.activeBoxWords.indexOf(null);
      if (emptyIdx !== -1) {
        gameState.activeBoxWords[emptyIdx] = word;
        const boxItem = document.querySelector(`.mini-box-item[data-index="${emptyIdx}"]`);
        if (boxItem) {
          boxItem.setAttribute('data-word', word);
        }
      }
    }
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
    
    // Check if this is the chosen bonus word
    let isBonus = false;
    if (gameState.bonusWord && typedWord === gameState.bonusWord && !gameState.bonusClaimedCurrentLevel) {
      gameState.bonusClaimedCurrentLevel = true;
      gameState.bonusCount = (gameState.bonusCount || 0) + 1;
      isBonus = true;
    }
    
    const compliments = ["Yum! Splendid!", "Gulp! Delicious!", "Tasty spelling!", "Crunchy word!", "Perfect!", "Ate it!"];
    const randComp = compliments[Math.floor(Math.random() * compliments.length)];
    
    if (isBonus) {
      updateBonusUI();
      updateHintButtonUI();
      updateFriendsUI();
      let friendUnlockedName = "";
      if (gameState.bonusCount === 1) friendUnlockedName = "Toxy (the diamond box)";
      else if (gameState.bonusCount === 2) friendUnlockedName = "Foxy (the flat pizza box)";
      else if (gameState.bonusCount === 3) friendUnlockedName = "Boby (the bubble envelope)";
      else if (gameState.bonusCount === 4) friendUnlockedName = "Cuppy (the paper cup)";
      else if (gameState.bonusCount === 5) friendUnlockedName = "Papy (the paper roll)";
      
      if (friendUnlockedName) {
        boxySpeak(`🌟 BONUS! Unlocked ${friendUnlockedName}! +1 Point & +1 Hint!`, 5000);
      } else {
        boxySpeak(`🌟 BONUS! +1 Point & +1 Hint Friend unlocked!`, 5000);
      }
    } else {
      boxySpeak(`${randComp} +1 point`, 3000);
    }

    // Reveal mini box
    revealMiniBox(typedWord);

    // Confetti burst
    triggerConfettiBurst();

    updateScoreUI();
    updateProgressUI();
    saveGameState();
 
    // Check level completed
    checkAutoProceed();
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
  if (!gameState.isPlaying) return;
  if (gameState.isTransitioning === true) return;
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

function getPlayableSubwordsCount() {
  if (!gameState.currentWordObj) return 0;
  const len = gameState.currentWordObj.subwords.length;
  return len > 12 ? 12 : len;
}

function updateProgressUI() {
  const W = getPlayableSubwordsCount();
  const foundCount = gameState.foundWords.length;
  
  document.getElementById('words-found-count').textContent = `${foundCount} / ${W}`;
  
  const progressPercent = Math.min(100, (foundCount / W) * 100);
  const progressBar = document.getElementById('words-progress-bar');
  progressBar.style.width = `${progressPercent}%`;
  
  const goalCount = gameState.easyMode ? Math.max(1, W - 2) : Math.max(1, W - 1);
  const goalPercent = (goalCount / W) * 100;
  
  const goalMarker = document.getElementById('goal-marker');
  goalMarker.style.left = `${goalPercent}%`;
  
  const needed = goalCount - foundCount;
  
  if (needed <= 0 && !gameState.isLevelUnlocked) {
    gameState.isLevelUnlocked = true;
    triggerBoxyEmotion('happy');
    boxySpeak("The next word package is unlocked!", 4000);
  }
}

function purchaseNextLevel() {
  // Guard against re-entrant calls during transition
  if (gameState.isTransitioning) return;

  const W = getPlayableSubwordsCount();
  const goalCount = gameState.easyMode ? Math.max(1, W - 2) : Math.max(1, W - 1);
  if (gameState.foundWords.length < goalCount) {
    playCrinkleSound();
    return;
  }

  // Set guard flag immediately
  gameState.isTransitioning = true;

  // Clear any pending auto-proceed timeout
  if (autoProceedTimeout) {
    clearTimeout(autoProceedTimeout);
    autoProceedTimeout = null;
  }

  // Record this completed package in history
  recordCurrentAttempt();

  playLevelUpSound();
  
  const nextLevel = gameState.level + 1;
  gameState.isLevelUnlocked = false;

  if (nextLevel > 7) {
    gameState.level = nextLevel; // Set level to 8 to mark game completion
    gameState.isTransitioning = false;
    showVictoryModal();
  } else {
    triggerBoxyEmotion('happy');
    showLevelTransition(nextLevel);
  }
}

function checkAutoProceed() {
  if (gameState.isTransitioning) return;

  const W = getPlayableSubwordsCount();
  const found = gameState.foundWords.length;
  const goalCount = gameState.easyMode ? Math.max(1, W - 2) : Math.max(1, W - 1);

  const nextLevelBtn = document.getElementById('btn-next-level');
  if (nextLevelBtn) {
    // If they completed the button animation previously, make sure it is enabled again
    nextLevelBtn.disabled = false;
    nextLevelBtn.classList.remove('disabled');
    if (gameState.level === 7) {
      nextLevelBtn.textContent = "CLAIM VICTORY ➔";
    } else {
      nextLevelBtn.textContent = "GO TO NEXT LEVEL ➔";
    }
  }

  // Once they hit the goal, show the proceed button
  if (found >= goalCount) {
    document.getElementById('next-level-btn-container')?.classList.remove('hidden');
  } else {
    document.getElementById('next-level-btn-container')?.classList.add('hidden');
  }

  // If they find ALL playable words (fill all boxes), auto-proceed after 1.5 seconds since there are no more slots to guess in
  if (found >= W) {
    if (autoProceedTimeout) {
      clearTimeout(autoProceedTimeout);
      autoProceedTimeout = null;
    }

    autoProceedTimeout = setTimeout(() => {
      autoProceedTimeout = null;
      if (gameState.timeLeft > 0 && !gameState.isTransitioning && gameState.foundWords.length >= W) {
        handleProceedToNextLevel();
      }
    }, 1500);
  }
}

// --- HINTS ---
function updateHintButtonUI() {
  const btnHint = document.getElementById('btn-hint');
  if (!btnHint) return;

  const bonusCount = gameState.bonusCount || 0;
  const used = gameState.hintsUsed || 0;
  const maxHints = 1 + bonusCount;
  const left = Math.max(0, maxHints - used);
  btnHint.textContent = `GET HINT (${left} left)`;

  if (left <= 0) {
    btnHint.classList.add('disabled');
    btnHint.disabled = true;
  } else {
    btnHint.classList.remove('disabled');
    btnHint.disabled = false;
  }
}

// Helper: count unfound words for current level
function getUnfoundWordCount() {
  if (!gameState.currentWordObj) return 0;
  const subwords = gameState.currentWordObj.subwords;
  return subwords.filter(w => !gameState.foundWords.includes(w)).length;
}

function updateFriendsUI() {
  const roxy = document.getElementById('friend-roxy');
  const toxy = document.getElementById('friend-toxy');
  const foxy = document.getElementById('friend-foxy');
  const boby = document.getElementById('friend-boby');
  const cuppy = document.getElementById('friend-cuppy');
  const papy = document.getElementById('friend-papy');
  if (!roxy || !toxy || !foxy || !boby || !cuppy || !papy) return;

  const bonusCount = gameState.bonusCount || 0;
  const used = gameState.hintsUsed || 0;
  const maxHints = 1 + bonusCount;

  const friendsList = [
    { el: roxy, minHints: 1 },
    { el: toxy, minHints: 2 },
    { el: foxy, minHints: 3 },
    { el: boby, minHints: 4 },
    { el: cuppy, minHints: 5 },
    { el: papy, minHints: 6 }
  ];

  friendsList.forEach((item) => {
    if (maxHints >= item.minHints) {
      if (used >= item.minHints) {
        item.el.style.display = 'none';
        item.el.classList.add('leaving');
        item.el.classList.remove('hidden-friend');
      } else {
        item.el.style.display = '';
        item.el.classList.remove('leaving');
        item.el.classList.remove('hidden-friend');
      }
    } else {
      item.el.style.display = 'none';
      item.el.classList.add('hidden-friend');
    }
  });
}

let isHintAnimating = false;

function purchaseHint() {
  if (!gameState.isPlaying) return;
  if (isHintAnimating) return;

  const bonusCount = gameState.bonusCount || 0;
  const used = gameState.hintsUsed || 0;
  const maxHints = 1 + bonusCount;
  const left = Math.max(0, maxHints - used);

  if (left <= 0) {
    boxySpeak("No more hints for this word!", 3000);
    playCrinkleSound();
    return;
  }

  const subwords = gameState.currentWordObj.subwords;
  
  // Find words that are not found, and not already assigned to boxes
  const eligibleWords = subwords.filter(word => 
    !gameState.foundWords.includes(word) && 
    !gameState.activeBoxWords.includes(word)
  );

  if (subwords.length > 12 && eligibleWords.length === 0) {
    boxySpeak("All boxes occupied!", 3500);
    playCrinkleSound();
    return;
  }

  let randWordIdx = -1;
  let targetWord = "";

  if (subwords.length <= 12) {
    // Standard mapping: pick from unfound words
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
    randWordIdx = unfoundIndices[Math.floor(Math.random() * unfoundIndices.length)];
    targetWord = subwords[randWordIdx];
  } else {
    // Dynamic mapping: assign a new eligible word to the first empty slot
    const emptyIdx = gameState.activeBoxWords.indexOf(null);
    if (emptyIdx === -1) {
      boxySpeak("All boxes occupied!", 3500);
      playCrinkleSound();
      return;
    }
    targetWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    gameState.activeBoxWords[emptyIdx] = targetWord;
    randWordIdx = emptyIdx;
    
    // Update the DOM data-word attribute immediately so that friend animation target can locate it
    const boxItem = document.querySelector(`.mini-box-item[data-index="${emptyIdx}"]`);
    if (boxItem) {
      boxItem.setAttribute('data-word', targetWord);
    }
  }

  // Populate hintsRevealed with all characters of targetWord
  gameState.hintsRevealed[randWordIdx] = [];
  for (let i = 0; i < targetWord.length; i++) {
    gameState.hintsRevealed[randWordIdx].push(i);
  }

  const friendIds = ['friend-roxy', 'friend-toxy', 'friend-foxy', 'friend-boby', 'friend-cuppy', 'friend-papy'];
  const currentFriendIndex = Math.min(gameState.hintsUsed || 0, friendIds.length - 1);
  const currentFriendId = friendIds[currentFriendIndex];
  const friendEl = document.getElementById(currentFriendId);
  const targetBox = document.querySelector(`.mini-box-item[data-index="${randWordIdx}"]`);

  // Only animate if the friend element exists and is currently visible
  const isFriendVisible = friendEl && friendEl.style.display !== 'none' && !friendEl.classList.contains('hidden-friend') && !friendEl.classList.contains('leaving');

  if (isFriendVisible && targetBox) {
    isHintAnimating = true;
    playScribbleSound();

    // Disable hint button during animation
    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
      btnHint.disabled = true;
      btnHint.classList.add('disabled');
    }

    // Get positions
    const friendRect = friendEl.getBoundingClientRect();
    const targetRect = targetBox.getBoundingClientRect();

    // Create flyer
    const flyer = document.createElement('div');
    flyer.className = 'flying-friend-flyer boxy-friend ' + currentFriendId.replace('friend-', '');
    flyer.style.width = `${friendEl.offsetWidth}px`;
    flyer.style.height = `${friendEl.offsetHeight}px`;
    flyer.style.left = `${friendRect.left + window.scrollX}px`;
    flyer.style.top = `${friendRect.top + window.scrollY}px`;

    const bodyClone = friendEl.querySelector('.friend-body, .friend-body-diamond, .friend-body-cup, .friend-body-roll').cloneNode(true);
    flyer.appendChild(bodyClone);
    document.body.appendChild(flyer);

    // Hide original friend immediately
    friendEl.classList.add('leaving');

    // Trigger CSS flyer transition
    setTimeout(() => {
      flyer.style.left = `${targetRect.left + window.scrollX + (targetBox.offsetWidth - friendEl.offsetWidth) / 2}px`;
      flyer.style.top = `${targetRect.top + window.scrollY + (targetBox.offsetHeight - friendEl.offsetHeight) / 2}px`;
      flyer.style.transform = 'scale(0.3) rotate(360deg)';
      flyer.style.opacity = '0.3';
    }, 20);

    // Finish animation
    const friends = [
      "Roxy (the mailing tube)",
      "Toxy (the diamond box)",
      "Foxy (the flat pizza box)",
      "Boby (the bubble envelope)",
      "Cuppy (the paper cup)",
      "Papy (the paper roll)"
    ];
    const helperFriend = friends[currentFriendIndex] || "Roxy (the mailing tube)";

    setTimeout(() => {
      flyer.remove();
      gameState.hintsUsed = (gameState.hintsUsed || 0) + 1;

      setupLevelUI();
      saveGameState();

      // Bounce and pop the box
      const newTargetBox = document.querySelector(`.mini-box-item[data-index="${randWordIdx}"]`);
      if (newTargetBox) {
        newTargetBox.classList.add('has-hint');
        newTargetBox.animate([
          { transform: 'scale(1)' },
          { transform: 'scale(1.25)', backgroundColor: 'var(--c-paper-yellow)' },
          { transform: 'scale(1)' }
        ], {
          duration: 450,
          easing: 'ease-out'
        });
      }

      isHintAnimating = false;
      triggerBoxyEmotion('happy');
      boxySpeak(`${helperFriend} helped and revealed a full word!`, 4000);
    }, 670);

  } else {
    // Fallback: reveal immediately without animation
    gameState.hintsUsed = (gameState.hintsUsed || 0) + 1;
    setupLevelUI();
    saveGameState();
    triggerBoxyEmotion('happy');
    boxySpeak("Revealed a full word!", 3000);
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
  localStorage.removeItem('n1_gameState'); // Clear active session to avoid code collisions on reload
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
  
  // Hide home screen and all modals/overlays so the player starts immediately on the Level 1 board
  ['reset-modal', 'home-screen', 'victory-modal', 'level-transition-overlay', 'help-modal', 'leaderboard-modal', 'history-modal'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  
  localStorage.removeItem('n1_gameState');
  
  // Clear transition state and pending timeouts
  gameState.isTransitioning = false;
  if (autoProceedTimeout) {
    clearTimeout(autoProceedTimeout);
    autoProceedTimeout = null;
  }
  // Make sure transition overlay is cleared of animations
  const transOverlay = document.getElementById('level-transition-overlay');
  if (transOverlay) {
    transOverlay.classList.remove('animating');
  }

  gameState.totalScore = 0;
  gameState.level = 4;
  gameState.foundWords = [];
  gameState.hintsRevealed = {};
  gameState.hintsUsed = 0;
  gameState.currentWordObj = null;
  gameState.isLevelUnlocked = false;
  gameState.timeLeft = 120;
  gameState.bonusCount = 0;
  gameState.bonusClaimedCurrentLevel = false;
  gameState.isPlaying = true;
  
  startNewLevel(4);
  triggerBoxyEmotion('idle');
  boxySpeak("Started fresh cardboard! Level 1!", 4000);

  // Start the timer loop and update UI immediately
  startTimerLoop();
  updateTimerUI();
  updateBonusUI();
  saveGameState();
}
function restartFromScratch() {
  playLevelUpSound();
  document.getElementById('victory-modal').classList.add('hidden');
  resetGame();
}
function showVictoryModal() {
  endGameSession(false);
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
          <span class="history-level-label">Level ${att.level - 3} (${att.level}L)</span>
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

// --- LEADERBOARD & SUPABASE ---
let currentLeaderboardTimeframe = 'today';

function openLeaderboardModal() {
  playTapSound();
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  switchLeaderboardTab('today');
}

function hideLeaderboardModal() {
  playTapSound();
  document.getElementById('leaderboard-modal').classList.add('hidden');
  
  // If the game session was completed (victory or timeout), show the victory modal again so the player has the Play Again option
  const victoryModal = document.getElementById('victory-modal');
  const isTimeUp = gameState.timeLeft <= 0;
  const isVictory = gameState.level > 7;
  if (isTimeUp || isVictory) {
    victoryModal.classList.remove('hidden');
  }
}

function switchLeaderboardTab(timeframe) {
  currentLeaderboardTimeframe = timeframe;
  
  const todayTab = document.getElementById('tab-leaderboard-today');
  const allTimeTab = document.getElementById('tab-leaderboard-alltime');
  
  if (timeframe === 'today') {
    todayTab.classList.add('active');
    allTimeTab.classList.remove('active');
  } else {
    todayTab.classList.remove('active');
    allTimeTab.classList.add('active');
  }
  
  loadLeaderboard(timeframe);
}

async function loadLeaderboard(timeframe) {
  const container = document.getElementById('leaderboard-list-container');
  container.innerHTML = '<p class="leaderboard-loading-msg">Loading scores...</p>';
  
  if (!supabaseClient) {
    container.innerHTML = '<p class="leaderboard-empty-msg">Supabase is not configured yet. Set your credentials at the top of game.js to activate the leaderboard!</p>';
    return;
  }
  
  try {
    let query = supabaseClient
      .from('high_scores')
      .select('*');
      
    if (timeframe === 'today') {
      // Scores from the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', yesterday);
    }
    
    const { data, error } = await query
      .order('score', { ascending: false })
      .limit(20);
      
    if (error) throw error;
    
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="leaderboard-empty-msg">No high scores recorded for this timeframe yet. Be the first!</p>';
      return;
    }
    
    data.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-item';
      
      const rank = index + 1;
      let rankClass = '';
      if (rank <= 3) {
        rankClass = ` leaderboard-rank-${rank}`;
      }
      
      const date = new Date(item.created_at);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      const badge = item.easy_mode ? '<span class="leaderboard-badge">Easy</span>' : '';
      
      row.innerHTML = `
        <span class="leaderboard-rank${rankClass}">${rank}</span>
        <span class="leaderboard-name">${escapeHTML(item.player_name)}</span>
        <div class="leaderboard-item-meta">
          ${badge}
          <span class="leaderboard-score">${item.score}</span>
          <span class="leaderboard-date">${dateStr}</span>
        </div>
      `;
      container.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
    container.innerHTML = '<p class="leaderboard-empty-msg error">Failed to load scores. Check network connection or configuration.</p>';
  }
}

async function submitHighScore() {
  if (!supabaseClient) {
    showLeaderboardStatus('Supabase credentials not configured at the top of game.js!', 'error');
    return;
  }
  
  const nameInput = document.getElementById('player-name-input');
  const name = nameInput.value.trim();
  if (!name) {
    showLeaderboardStatus('Please enter a name!', 'error');
    return;
  }
  
  const submitBtn = document.getElementById('btn-submit-score');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  submitBtn.classList.add('disabled');
  nameInput.disabled = true;
  
  try {
    const { error } = await supabaseClient
      .from('high_scores')
      .insert([
        {
          player_name: name,
          score: gameState.totalScore,
          easy_mode: gameState.easyMode === true
        }
      ]);
      
    if (error) throw error;
    
    showLeaderboardStatus('Score submitted successfully!', 'success');
    
    setTimeout(() => {
      document.getElementById('victory-modal').classList.add('hidden');
      openLeaderboardModal();
    }, 1200);
    
  } catch (err) {
    console.error('Failed to submit score:', err);
    showLeaderboardStatus('Error submitting score. Try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('disabled');
    nameInput.disabled = false;
  }
}

function showLeaderboardStatus(msg, type) {
  const statusLabel = document.getElementById('leaderboard-status');
  statusLabel.textContent = msg;
  statusLabel.className = `leaderboard-status ${type}`;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// --- SESSION TIMER HELPERS ---
let timerInterval = null;

function isGameActive() {
  // Check if home screen is showing
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen && !homeScreen.classList.contains('hidden')) return false;

  // Check if victory modal is showing
  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal && !victoryModal.classList.contains('hidden')) return false;

  // Check if level transition overlay is showing
  const transitionOverlay = document.getElementById('level-transition-overlay');
  const isTransitioning = transitionOverlay && !transitionOverlay.classList.contains('hidden');
  if (isTransitioning) return false;

  // Check if reset modal is showing
  const resetModal = document.getElementById('reset-modal');
  if (resetModal && !resetModal.classList.contains('hidden')) return false;

  // Check if help modal is showing
  const helpModal = document.getElementById('help-modal');
  if (helpModal && !helpModal.classList.contains('hidden')) return false;

  // Check if leaderboard modal is showing
  const leaderboardModal = document.getElementById('leaderboard-modal');
  if (leaderboardModal && !leaderboardModal.classList.contains('hidden')) return false;

  // Check if history modal is showing
  const historyModal = document.getElementById('history-modal');
  if (historyModal && !historyModal.classList.contains('hidden')) return false;

  return true;
}

function startTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(() => {
    if (isGameActive()) {
      gameState.timeLeft--;
      
      // Update UI
      updateTimerUI();
      
      // Save game state every 5 seconds (when timeLeft is a multiple of 5)
      if (gameState.timeLeft % 5 === 0) {
        saveGameState();
      }
      
      // Check if time is up
      if (gameState.timeLeft <= 0) {
        saveGameState();
        endGameSession(true);
      }
    }
  }, 1000);
}

function updateTimerUI() {
  const timerSpan = document.getElementById('game-timer');
  if (!timerSpan) return;
  
  const minutes = Math.floor(Math.max(0, gameState.timeLeft) / 60);
  const seconds = Math.max(0, gameState.timeLeft) % 60;
  timerSpan.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  
  if (gameState.timeLeft <= 30) {
    timerSpan.classList.add('timer-urgent');
  } else {
    timerSpan.classList.remove('timer-urgent');
  }
}

function endGameSession(isTimeUp) {
  // Stop the timer
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  // Clear saved active game session since it is ended
  localStorage.removeItem('n1_gameState');
  gameState.isPlaying = false;
  
  // Hide home screen and other modal overlays so they don't overlap/block victory modal
  document.getElementById('home-screen')?.classList.add('hidden');
  ['reset-modal', 'help-modal', 'history-modal', 'leaderboard-modal'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });

  // Hide the transition overlay as well so it doesn't get stuck blocking the view
  const transOverlay = document.getElementById('level-transition-overlay');
  if (transOverlay) {
    transOverlay.classList.add('hidden');
    transOverlay.classList.remove('animating');
  }
  gameState.isTransitioning = false;
  if (transitionTimeout) {
    clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }

  // Populate final score
  const finalScore = gameState.totalScore;
  document.getElementById('vic-final-score').textContent = finalScore;

  // Change victory modal title dynamically
  const titleEl = document.querySelector('.victory-title');
  if (titleEl) {
    titleEl.textContent = isTimeUp ? "⏰ TIME'S UP! ⏰" : "🎉 VICTORY! 🎉";
  }

  // Reset leaderboard submission UI
  const nameInput = document.getElementById('player-name-input');
  if (nameInput) {
    nameInput.value = '';
    nameInput.disabled = false;
  }
  const submitBtn = document.getElementById('btn-submit-score');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('disabled');
  }
  const statusLabel = document.getElementById('leaderboard-status');
  if (statusLabel) {
    statusLabel.textContent = '';
    statusLabel.className = 'leaderboard-status hidden';
  }

  // Show victory modal
  document.getElementById('victory-modal').classList.remove('hidden');
  
  // Play sound and trigger reaction
  playLevelUpSound();
  triggerBoxyEmotion(isTimeUp ? 'sad' : 'happy');
  
  if (isTimeUp) {
    boxySpeak("Time's up! Great effort, let's submit your score!", 10000);
  } else {
    boxySpeak("VICTORY! We cleared it!", 10000);
    startVictoryConfetti();
  }
}

function updateBonusUI() {
  const bonusCounter = document.getElementById('bonus-counter');
  if (bonusCounter) {
    bonusCounter.textContent = gameState.bonusCount || 0;
  }
}

let transitionTimeout = null;

function showLevelTransition(nextLevel) {
  const overlay = document.getElementById('level-transition-overlay');
  if (!overlay) {
    gameState.isTransitioning = false;
    startNewLevel(nextLevel);
    return;
  }
  
  // Add +2 minutes
  gameState.timeLeft += 120;
  saveGameState();
  updateTimerUI();
  
  // Set text on the sign
  const levelNum = nextLevel - 3;
  const signText = document.getElementById('transition-sign-text');
  if (signText) {
    signText.textContent = `LEVEL ${levelNum}`;
  }
  
  // Play transition sound (crinkle)
  playCrinkleSound();
  
  // Helper to cleanly dismiss the transition
  function dismissTransition() {
    overlay.classList.add('hidden');
    overlay.classList.remove('animating');
    gameState.isTransitioning = false;
    if (transitionTimeout) {
      clearTimeout(transitionTimeout);
      transitionTimeout = null;
    }
  }
  
  // Allow clicking the overlay to dismiss/skip
  overlay.onclick = () => {
    dismissTransition();
  };
  
  // Show overlay (triggers CSS animations)
  overlay.classList.remove('hidden');
  overlay.classList.add('animating');
  
  // Start the new level immediately in the background
  startNewLevel(nextLevel);
  
  // Clear any existing timeout
  if (transitionTimeout) {
    clearTimeout(transitionTimeout);
  }
  
  // Wait exactly 4 seconds (4000ms) for Boxy to cross the screen
  transitionTimeout = setTimeout(() => {
    dismissTransition();
  }, 4000);
}

function handleProceedToNextLevel() {
  const nextLevelBtn = document.getElementById('btn-next-level');
  if (!nextLevelBtn || nextLevelBtn.disabled) return;
  
  nextLevelBtn.disabled = true;
  nextLevelBtn.classList.add('disabled');
  playTapSound();
  
  // Clear any pending autoProceed timeout
  if (autoProceedTimeout) {
    clearTimeout(autoProceedTimeout);
    autoProceedTimeout = null;
  }

  const W = getPlayableSubwordsCount();
  const found = gameState.foundWords.length;

  // If they found all playable words (all boxes filled), proceed immediately with no missing words reveal
  if (found >= W) {
    document.getElementById('next-level-btn-container')?.classList.add('hidden');
    purchaseNextLevel();
    return;
  }

  const subwords = gameState.currentWordObj.subwords || [];
  const missingWords = subwords.filter(w => !gameState.foundWords.includes(w));
  
  if (missingWords.length > 0) {
    // Reveal the missing words in red in the grid
    missingWords.forEach(missingWord => {
      let emptyIdx = gameState.activeBoxWords.indexOf(missingWord);
      if (emptyIdx === -1) {
        emptyIdx = gameState.activeBoxWords.indexOf(null);
        if (emptyIdx !== -1) {
          gameState.activeBoxWords[emptyIdx] = missingWord;
        }
      }
      
      if (emptyIdx !== -1) {
        const boxItem = document.querySelector(`.mini-box-item[data-index="${emptyIdx}"]`);
        if (boxItem) {
          boxItem.setAttribute('data-word', missingWord);
          boxItem.classList.add('revealed', 'missed');
          const label = boxItem.querySelector('.found-word-label');
          if (label) {
            label.textContent = missingWord.toUpperCase();
          }
        }
      }
    });
    
    // Create floating non-blocking notification banner in red
    const notification = document.createElement('div');
    notification.className = 'missing-word-notification';
    notification.textContent = `MISSING WORD${missingWords.length > 1 ? 'S' : ''}: ${missingWords.map(w => w.toUpperCase()).join(', ')}`;
    document.body.appendChild(notification);
    
    // Play crinkle/feedback sound
    playCrinkleSound();
    
    // Wait exactly 2 seconds before proceeding
    gameState.isTransitioning = true; // Set guard
    setTimeout(() => {
      notification.remove();
      gameState.isTransitioning = false; // Reset guard
      document.getElementById('next-level-btn-container')?.classList.add('hidden');
      purchaseNextLevel();
    }, 2000);
  } else {
    document.getElementById('next-level-btn-container')?.classList.add('hidden');
    purchaseNextLevel();
  }
}

// --- PWA HELPER FUNCTIONS & GLOBAL EVENT LISTENERS ---
function checkPWAInstallPrompt() {
  const dismissed = localStorage.getItem('n1_pwa_dismissed') === 'true';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (dismissed || isStandalone) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const banner = document.getElementById('pwa-install-banner');
  const textEl = document.getElementById('pwa-install-text');
  const installBtn = document.getElementById('btn-pwa-install');

  if (isIOS && isSafari && banner) {
    // Show iOS custom instructions
    if (textEl) {
      textEl.innerHTML = "📦 To play offline as a full-screen App: tap the Share button (📤) and select <strong>Add to Home Screen</strong>.";
    }
    if (installBtn) {
      installBtn.style.display = 'none'; // Hide native install button since iOS requires manual Add to Home Screen
    }
    banner.classList.remove('hidden');
  } else if (!isIOS && deferredPrompt && banner) {
    // If deferredPrompt is already caught, make sure the banner is shown
    banner.classList.remove('hidden');
  }
}

// Global window event listener to catch beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show PWA banner if not dismissed and not in standalone
  const dismissed = localStorage.getItem('n1_pwa_dismissed') === 'true';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!dismissed && !isStandalone) {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('hidden');
    }
  }
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed successfully');
  deferredPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
});
