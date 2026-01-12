

// ============================================================================
// DOUBLE DECISION GAME - Wrapped in IIFE to prevent global scope conflicts
// ============================================================================
(function() {
'use strict';

// Utility: Hide Double Decision game area and show start screen
function showDDStartScreen() {
    if (typeof document === 'undefined') return;
    var startScreen = document.getElementById('dd-startScreen');
    var gameArea = document.getElementById('dd-gameArea');
    var gameOverScreen = document.getElementById('dd-gameOverScreen');
    if (startScreen) startScreen.classList.remove('hidden');
    if (gameArea) gameArea.classList.add('hidden');
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
}

// Listen for menu switch to always reset DD view
if (typeof window !== 'undefined') {
    window.addEventListener('popstate', function() {
        var mainMenu = document.getElementById('mainMenu');
        if (mainMenu && mainMenu.style.display === 'flex') {
            showDDStartScreen();
        }
    });
}

// Patch switchGame to always reset DD view when entering DD
if (typeof window !== 'undefined') {
    var origSwitchGame = window.switchGame;
    window.switchGame = function(gameName) {
        if (gameName === 'doubleDecision') {
            showDDStartScreen();
        }
        if (typeof origSwitchGame === 'function') {
            return origSwitchGame.apply(this, arguments);
        }
    };
}
'use strict';

// =============================
// SECTOR-INDEX-BASED PERIPHERAL OBJECT SPAWNING SYSTEM
// =============================

// Spawns peripheral objects for the round based on difficulty
// Returns an array of objects: { type: 'correct'|'fake', img: string, sectorIndex: number }
function spawnPeripheralObjects(difficulty) {
    const sectors = Array.from({length: NUM_SECTORS}, (_, i) => i);
    // Shuffle sector indices
    for (let i = sectors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sectors[i], sectors[j]] = [sectors[j], sectors[i]];
    }
    const correctImg = ACTIVE_THEME.peripheralObject;
    const fakeImgs = ACTIVE_THEME.fakePeripheralObjects || [];
    let objects = [];
    // Always 1 correct
    objects.push({ type: 'correct', img: correctImg, sectorIndex: sectors[0] });
    if (difficulty === 'medium') {
        // 3 incorrect
        for (let i = 1; i <= 3; i++) {
            objects.push({ type: 'fake', img: fakeImgs[Math.floor(Math.random() * fakeImgs.length)], sectorIndex: sectors[i] });
        }
    } else if (difficulty === 'hard') {
        // 7 incorrect
        for (let i = 1; i < NUM_SECTORS; i++) {
            objects.push({ type: 'fake', img: fakeImgs[Math.floor(Math.random() * fakeImgs.length)], sectorIndex: sectors[i] });
        }
    }
    return objects;
}

// Returns {left, top, transform} for a given sectorIndex (0..NUM_SECTORS-1)
function getPositionFromSector(sectorIndex) {
    const step = (2 * Math.PI) / NUM_SECTORS;
    const cx = 50, cy = 50, r = 13;
    const angle = (sectorIndex + 0.5) * step - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return {
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)'
    };
}

// Returns true if the sector contains at least one correct object
function isSectorCorrect(objects, sectorIndex) {
    return objects.some(obj => obj.sectorIndex === sectorIndex && obj.type === 'correct');
}
'use strict';

// ============================================================================
// GAME CONFIGURATION - Easy to adjust values
// ============================================================================

// Number of peripheral positions (currently 8)
const NUM_PERIPHERAL_POSITIONS = 8;


// Object types for center and peripheral display
// Now includes correct and fake peripheral objects for each theme
const THEMES = {
    space: {
        centerObjects: ['img/ufo1.png', 'img/ufo2.png'],
        peripheralObject: 'img/moon.png', // correct
        fakePeripheralObjects: ['img/phobos.png'], // wrong
        hardPeripheralObjects: ['img/phobos.png'], // only fake peripheral objects, never center objects
        backgroundClass: 'dd-theme-space',
        clickPrompt: 'Click the sector where the object appeared'
    },
    ocean: {
        centerObjects: ['img/shark1.png', 'img/shark2.png'],
        peripheralObject: 'img/dolphin.png', // correct
        fakePeripheralObjects: ['img/dolphin2.png'], // wrong
        hardPeripheralObjects: ['img/dolphin2.png'], // only fake peripheral objects, never center objects
        backgroundClass: 'dd-theme-ocean',
        clickPrompt: 'Click the sector where object appeared'
    },
    savanna: {
        centerObjects: ['img/cheetah.png', 'img/leopard.png'],
        peripheralObject: 'img/impala.png', // correct
        fakePeripheralObjects: ['img/antelope.png'], // wrong
        hardPeripheralObjects: ['img/antelope.png'], // only fake peripheral objects, never center objects
        backgroundClass: 'dd-theme-savanna',
        clickPrompt: 'Click the sector where object appeared'
    }
};

let ACTIVE_THEME = THEMES.space; // Default theme



// Initial display time in milliseconds (starts at easiest, decreases each round)
const INITIAL_DISPLAY_TIME = 500;

// Minimum and maximum display times (in milliseconds)
const MIN_DISPLAY_TIME = 200;
const MAX_DISPLAY_TIME = 1000;

// Difficulty adjustment step (how much to increase/decrease time)
const DIFFICULTY_STEP = 50;

// Total number of rounds before game over
const TOTAL_ROUNDS = 10;

// ============================================================================
// GAME STATE
// ============================================================================

let gameState = {
    currentRound: 1,
    totalAttempts: 0,
    correctAnswers: 0,
    displayTime: INITIAL_DISPLAY_TIME,
    centerObject: '',
    peripheralPosition: -1,
    centerChoice: null,
    peripheralChoice: null,
    gameActive: false,
    waitingForInput: false,
    selectedDifficulty: 'easy' // default, can be changed by user
};


// ============================================================================
// DOM ELEMENTS
// ============================================================================

const centerObjectDisplay = document.getElementById('dd-centerObject');
const choiceButtons = document.querySelectorAll('.dd-choice-btn');
const roundCounter = document.getElementById('dd-roundCounter');
const attemptsCounter = document.getElementById('dd-attemptsCounter');
const accuracyCounter = document.getElementById('dd-accuracyCounter');
const difficultyDisplay = document.getElementById('dd-difficultyDisplay');
const clickPrompt = document.getElementById('dd-clickPrompt');
const gameOverScreen = document.getElementById('dd-gameOverScreen');
const finalAccuracy = document.getElementById('dd-finalAccuracy');
const finalAttempts = document.getElementById('dd-finalAttempts');
const restartBtn = document.getElementById('dd-restartBtn');
const startScreen = document.getElementById('dd-startScreen');
const startBtn = document.getElementById('dd-startBtn');
const gameRestartBtn = document.getElementById('dd-gameRestartBtn');
const sectorSvg = document.getElementById('dd-sectorSvg');
const sectorsGroup = document.getElementById('dd-sectors');
const moonImg = document.getElementById('dd-moon');
const progressBar = document.getElementById('dd-progressBar');
const progressText = document.getElementById('dd-progressText');
const progressDetails = document.getElementById('dd-progressDetails');

// Difficulty selection UI (to be added to start screen)
let difficultySelection = document.getElementById('dd-difficultySelection');
if (!difficultySelection && startScreen) {
    // Create difficulty selection if not present
    difficultySelection = document.createElement('div');
    difficultySelection.id = 'dd-difficultySelection';
    difficultySelection.innerHTML = `
        <h3>Select Difficulty:</h3>
        <button class="dd-difficulty-btn" data-difficulty="easy">Easy</button>
        <button class="dd-difficulty-btn" data-difficulty="medium">Medium</button>
        <button class="dd-difficulty-btn" data-difficulty="hard">Hard</button>
        <div id="dd-difficultyDesc" style="margin-top:8px;font-size:0.95em;color:#555;"></div>
    `;
    startScreen.insertBefore(difficultySelection, startBtn);
}

// Disable start button until difficulty is selected
if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'pointer-events-none');
}

let NUM_SECTORS = 8;
// ============================================================================
// LOCAL STORAGE FUNCTIONS
// ============================================================================

function saveGameState() {
    const stateToSave = {
        displayTime: gameState.displayTime,
        totalAttempts: gameState.totalAttempts,
        correctAnswers: gameState.correctAnswers
    };
    localStorage.setItem('doubleDecisionGame', JSON.stringify(stateToSave));
}

function loadGameState() {
    const saved = localStorage.getItem('doubleDecisionGame');
    if (saved) {
        const savedState = JSON.parse(saved);
        gameState.displayTime = savedState.displayTime || INITIAL_DISPLAY_TIME;
        gameState.totalAttempts = savedState.totalAttempts || 0;
        gameState.correctAnswers = savedState.correctAnswers || 0;
        updateScoreDisplay();
    }
}

function clearGameState() {
    localStorage.removeItem('doubleDecisionGame');
}

// ============================================================================
// SCORE DISPLAY FUNCTIONS
// ============================================================================

function updateScoreDisplay() {
    if (roundCounter) roundCounter.textContent = gameState.currentRound;
    if (attemptsCounter) attemptsCounter.textContent = gameState.totalAttempts;
    
    const accuracy = gameState.totalAttempts > 0 
        ? Math.round((gameState.correctAnswers / gameState.totalAttempts) * 100)
        : 0;
    if (accuracyCounter) accuracyCounter.textContent = `${accuracy}%`;
    
    if (difficultyDisplay) difficultyDisplay.textContent = `${gameState.displayTime}ms`;
    
    // Update progress bar
    updateProgressBar();
}

function updateProgressBar() {
    // Calculate progress: (currentRound - 1) / TOTAL_ROUNDS * 100
    // We use currentRound - 1 because we want to show progress after completing a round
    const progress = Math.min(100, Math.round(((gameState.currentRound - 1) / TOTAL_ROUNDS) * 100));
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        if (progress === 100) {
            progressBar.classList.add('complete');
        } else {
            progressBar.classList.remove('complete');
        }
    }
    
    if (progressText) {
        progressText.textContent = `${progress}%`;
    }
    
    if (progressDetails) {
        const remaining = TOTAL_ROUNDS - (gameState.currentRound - 1);
        progressDetails.textContent = `Round ${gameState.currentRound - 1} of ${TOTAL_ROUNDS} • ${remaining} remaining`;
    }
}

// ============================================================================
// GAME LOGIC FUNCTIONS
// ============================================================================

function getRandomCenterObject() {
    // Randomly select one of the center objects
    const objs = ACTIVE_THEME.centerObjects;
    return objs[Math.floor(Math.random() * objs.length)];
}

function getRandomPeripheralPosition() {
    // Randomly select one of the 8 peripheral positions
    return Math.floor(Math.random() * NUM_PERIPHERAL_POSITIONS);
}

function getPositionCoordinates(position) {
    // Returns the coordinates for positioning the peripheral object
    // Position 0-7 correspond to the 8 positions around the center
    // Using ~90% to keep moon within bounds (instead of 100% which goes outside)
    const positions = [
        { top: '5%', left: '50%', transform: 'translate(-50%, -50%)' },      // Top
        { top: '20%', left: '90%', transform: 'translate(-50%, -50%)' },     // Top Right
        { top: '50%', left: '90%', transform: 'translate(-50%, -50%)' },      // Right
        { top: '80%', left: '90%', transform: 'translate(-50%, -50%)' },       // Bottom Right
        { top: '95%', left: '50%', transform: 'translate(-50%, -50%)' },      // Bottom
        { top: '80%', left: '10%', transform: 'translate(-50%, -50%)' },       // Bottom Left
        { top: '50%', left: '10%', transform: 'translate(-50%, -50%)' },      // Left
        { top: '20%', left: '10%', transform: 'translate(-50%, -50%)' }       // Top Left
    ];
    return positions[position];
}

function resetUI() {
    // Reset choice buttons - query fresh to get current state
    const freshButtons = document.querySelectorAll('.dd-choice-btn');
    freshButtons.forEach(btn => {
        if (btn) {
            btn.disabled = false;
            // Remove all possible state classes
            btn.classList.remove('selected', 'disabled', 'opacity-50');
            // Ensure pointer events are enabled
            btn.classList.add('btn-pointer-auto');
            btn.classList.remove('btn-pointer-none');
        }
    });

    // Reset sectors - make them clickable
    const sectors = document.querySelectorAll('.dd-sector');
    if (sectors && sectors.length > 0) {
        sectors.forEach(sector => {
            if (sector) {
                sector.classList.remove('selected');
                sector.classList.add('sector-pointer-auto', 'sector-opacity-full');
                sector.classList.remove('sector-pointer-none', 'sector-opacity-half');
            }
        });
    }

    // Reset prompt
    if (clickPrompt) {
        clickPrompt.textContent = 'Get ready...';
        clickPrompt.classList.remove('text-green-600', 'text-red-600');
    }
}

function displayObjects() {
    // Reset before showing
    gameState.centerChoice = null;
    gameState.peripheralChoice = null;
    gameState.waitingForInput = false;

    // Reset UI - ensure buttons are fully reset
    resetUI();
    
    // Re-setup event listeners to ensure buttons are clickable
    setupGameEventListeners();

    // Random center object
    gameState.centerObject = getRandomCenterObject();

    // --- Peripheral object logic by difficulty (sector-index-based) ---
    // Generate peripheral objects for this round
    const peripheralObjects = spawnPeripheralObjects(gameState.selectedDifficulty);
    gameState.peripheralObjectsThisRound = peripheralObjects;

    // Show center object (UFO image)
    const centerObjectImg = document.getElementById('dd-centerObjectImg');
    if (centerObjectImg) {
        centerObjectImg.src = gameState.centerObject;
        centerObjectImg.classList.remove('hidden');
        centerObjectImg.classList.add('dd-object-visible');
    }
    if (centerObjectDisplay) {
        centerObjectDisplay.classList.remove('dd-object-hidden');
        centerObjectDisplay.classList.add('dd-object-visible');
    }

    // Position all peripheral objects in sectors
    positionPeripheralObjectsInSectors(peripheralObjects);

    // Enable choice buttons
    if (choiceButtons && choiceButtons.length > 0) {
        choiceButtons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50');
            }
        });
    }



    // After display time, hide everything
    setTimeout(() => {
        const centerObjectImg = document.getElementById('dd-centerObjectImg');
        if (centerObjectImg) {
            centerObjectImg.classList.add('hidden');
            centerObjectImg.classList.remove('dd-object-visible');
        }
        if (centerObjectDisplay) {
            centerObjectDisplay.classList.remove('dd-object-visible');
            centerObjectDisplay.classList.add('dd-object-hidden');
        }
        // Hide all peripheral images
        hidePeripheralObjects();

        setTimeout(() => {
            gameState.waitingForInput = true;
            if (clickPrompt) clickPrompt.textContent = 'Click the sector where the object appeared';
        }, 400); // slower appearance
    }, gameState.displayTime + 200); // slower appearance
}

// Helper to position all peripheral objects in sectors
// Helper to position all peripheral objects in sectors
function positionPeripheralObjectsInSectors(peripheralObjects) {
    // Remove any previous peripheral images
    let container = document.getElementById('dd-peripheralContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dd-peripheralContainer';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.pointerEvents = 'none';
        document.getElementById('dd-gameArea').appendChild(container);
    }
    container.innerHTML = '';
    // Place all peripheral objects strictly by sectorIndex (no random offset)
    peripheralObjects.forEach(obj => {
        const pos = getPositionFromSector(obj.sectorIndex);
        const img = document.createElement('img');
        img.src = obj.img;
        img.className = 'moon-visible dd-peripheral-img';
        img.style.position = 'absolute';
        img.style.left = pos.left;
        img.style.top = pos.top;
        img.style.transform = pos.transform;
        img.style.width = '64px';
        img.style.height = '64px';
        img.style.pointerEvents = 'none';
        container.appendChild(img);
    });
}

function hidePeripheralObjects() {
    let container = document.getElementById('dd-peripheralContainer');
    if (container) container.innerHTML = '';
}

function checkAnswers() {
    if (gameState.centerChoice === null || gameState.peripheralChoice === null) {
        return; // Not ready yet
    }

    // Disable all inputs after both choices are made
    if (choiceButtons && choiceButtons.length > 0) {
        choiceButtons.forEach(btn => {
            if (btn) btn.disabled = true;
        });
    }
    const sectors = document.querySelectorAll('.dd-sector');
    if (sectors && sectors.length > 0) {
        sectors.forEach(sector => {
            if (sector) {
                sector.classList.add('sector-pointer-none');
                sector.classList.remove('sector-pointer-auto');
            }
        });
    }

    gameState.totalAttempts++;

    // Center answer is correct if matches center object
    const centerCorrect = gameState.centerChoice === gameState.centerObject;

    // Peripheral answer is correct if the chosen sector contains at least one correct object
    let peripheralCorrect = isSectorCorrect(gameState.peripheralObjectsThisRound, gameState.peripheralChoice);

    const bothCorrect = centerCorrect && peripheralCorrect;

    // Visual feedback
    if (clickPrompt) {
        if (bothCorrect) {
            clickPrompt.textContent = '✓ Both correct!';
            clickPrompt.classList.add('text-green-600');
        } else {
            clickPrompt.textContent = '✗ Try again!';
            clickPrompt.classList.add('text-red-600');
        }
    }

    if (bothCorrect) {
        gameState.correctAnswers++;
    }

    // Increase difficulty every round by 50ms (decrease display time - make harder)
    gameState.displayTime = Math.max(
        MIN_DISPLAY_TIME,
        gameState.displayTime - DIFFICULTY_STEP
    );

    updateScoreDisplay();
    saveGameState();

    // Move to next round or end game
    gameState.currentRound++;
    updateProgressBar();
    
    if (gameState.currentRound > TOTAL_ROUNDS) {
        setTimeout(() => {
            endGame();
        }, 1500);
    } else {
        // Reset everything before next round
        setTimeout(() => {
            // Reset UI completely
            resetUI();
            // Reset game state for next round
            gameState.centerChoice = null;
            gameState.peripheralChoice = null;
            gameState.waitingForInput = false;
            // Start next round
            displayObjects();
        }, 1500);
    }
}

function showConfirmModal() {
    const confirmModal = document.getElementById('dd-confirmModal');
    if (confirmModal) {
        confirmModal.classList.remove('hidden');
    }
}

function hideConfirmModal() {
    const confirmModal = document.getElementById('dd-confirmModal');
    if (confirmModal) {
        confirmModal.classList.add('hidden');
    }
}

function endGame() {
    gameState.gameActive = false;
    const accuracy = gameState.totalAttempts > 0 
        ? Math.round((gameState.correctAnswers / gameState.totalAttempts) * 100)
        : 0;
    
    if (finalAccuracy) finalAccuracy.textContent = `${accuracy}%`;
    if (finalAttempts) finalAttempts.textContent = gameState.totalAttempts;
    if (gameOverScreen) gameOverScreen.classList.remove('hidden');
}

function resetGame() {
    // Hide game over screen
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    
    // Reset game state
    gameState.currentRound = 1;
    gameState.totalAttempts = 0;
    gameState.correctAnswers = 0;
    gameState.displayTime = INITIAL_DISPLAY_TIME;
    gameState.centerChoice = null;
    gameState.peripheralChoice = null;
    gameState.gameActive = false;
    gameState.waitingForInput = false;

    // Clear displays
    const centerObjectImg = document.getElementById('dd-centerObjectImg');
    if (centerObjectImg) {
        centerObjectImg.src = '';
        centerObjectImg.classList.add('hidden');
        centerObjectImg.classList.remove('dd-object-visible');
    }
    if (centerObjectDisplay) {
        centerObjectDisplay.classList.remove('dd-object-visible', 'dd-object-hidden');
    }
    if (moonImg) {
        moonImg.classList.remove('moon-visible');
        moonImg.classList.add('moon-hidden');
    }

    // Reset UI elements
    resetUI();
    if (clickPrompt) clickPrompt.classList.remove('text-green-600', 'text-red-600');

    // Clear localStorage
    clearGameState();

    updateScoreDisplay();
    updateProgressBar();
    
    // Start new game
    setTimeout(() => {
        startGame();
    }, 500);
}

function startGame() {
    // Hide start screen and show game area
    startScreen.classList.add('hidden');
    document.getElementById('dd-gameArea').classList.remove('hidden');

    buildSectors(NUM_SECTORS);
    
    // Reset game state
    gameState.currentRound = 1;
    gameState.totalAttempts = 0;
    gameState.correctAnswers = 0;
    gameState.displayTime = INITIAL_DISPLAY_TIME;
    gameState.centerChoice = null;
    gameState.peripheralChoice = null;
    gameState.gameActive = true;
    gameState.waitingForInput = false;
    
    // Update display
    updateScoreDisplay();
    
    // Clear any previous game state
    resetUI();
    
    // Re-setup event listeners to ensure they work
    setupGameEventListeners();
    
    // Start first round
    setTimeout(() => {
        displayObjects();
    }, 500);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupGameEventListeners() {
    // Get all choice buttons
    const freshChoiceButtons = document.querySelectorAll('.dd-choice-btn');
    
    // For each button: reset it, clone it (to remove old listeners), and attach new listener
    freshChoiceButtons.forEach(btn => {
        if (!btn || !btn.parentNode) return;
        
        // First, reset the button to clean state
        btn.disabled = false;
        btn.classList.remove('selected', 'disabled', 'opacity-50');
        btn.classList.add('btn-pointer-auto');
        btn.classList.remove('btn-pointer-none');
        
        // Clone to remove old event listeners
        const newBtn = btn.cloneNode(true);
        
        // Ensure cloned button is in clean state
        newBtn.disabled = false;
        newBtn.classList.remove('selected', 'disabled', 'opacity-50');
        newBtn.classList.add('btn-pointer-auto');
        newBtn.classList.remove('btn-pointer-none');
        
        // Replace old button with new one
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Attach new event listener
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!gameState.waitingForInput || gameState.centerChoice !== null || newBtn.disabled) {
                return;
            }
            
            gameState.centerChoice = newBtn.dataset.choice;
            
            // Visual feedback
            newBtn.classList.add('selected');
            
            // Disable other buttons
            const allButtons = document.querySelectorAll('.dd-choice-btn');
            allButtons.forEach(otherBtn => {
                if (otherBtn !== newBtn) {
                    otherBtn.disabled = true;
                    otherBtn.classList.add('disabled');
                }
            });
            
            checkAnswers();
        });
    });

    // Sector clicks are handled in buildSectors function
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

function setupEventListeners() {
    // Restart button (in game over screen)
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            resetGame();
        });
    }

    // Restart button (in game area)
    if (gameRestartBtn) {
        gameRestartBtn.addEventListener('click', () => {
            showConfirmModal();
        });
    }
    
    // Confirmation modal handlers
    const confirmModal = document.getElementById('dd-confirmModal');
    const confirmYes = document.getElementById('dd-confirmYes');
    const confirmNo = document.getElementById('dd-confirmNo');
    
    if (confirmYes) {
        confirmYes.addEventListener('click', () => {
            hideConfirmModal();
            resetGame();
        });
    }
    
    if (confirmNo) {
        confirmNo.addEventListener('click', () => {
            hideConfirmModal();
        });
    }
    
    // Close modal when clicking outside
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                hideConfirmModal();
            }
        });
    }
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const confirmModal = document.getElementById('dd-confirmModal');
            if (confirmModal && !confirmModal.classList.contains('hidden')) {
                hideConfirmModal();
            }
        }
    });

    // Difficulty selection buttons
    const diffBtns = document.querySelectorAll('.dd-difficulty-btn');
    const diffDesc = document.getElementById('dd-difficultyDesc');
    if (diffBtns && diffBtns.length > 0) {
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                gameState.selectedDifficulty = btn.dataset.difficulty;
                // Highlight selected
                diffBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // Enable start button
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.classList.remove('opacity-50', 'pointer-events-none');
                }
                // Optionally, show description
                if (diffDesc) {
                    if (btn.dataset.difficulty === 'easy') diffDesc.textContent = 'Easy: Only one correct peripheral object appears.';
                    if (btn.dataset.difficulty === 'medium') diffDesc.textContent = 'Medium: Correct and a few wrong peripheral objects appear. Only the default is correct.';
                    if (btn.dataset.difficulty === 'hard') diffDesc.textContent = 'Hard: Correct and more fake objects appear. Only the default is correct.';
                }
            });
            btn.addEventListener('mouseenter', () => {
                if (diffDesc) {
                    if (btn.dataset.difficulty === 'easy') diffDesc.textContent = 'Easy: Only one correct peripheral object appears.';
                    if (btn.dataset.difficulty === 'medium') diffDesc.textContent = 'Medium: Correct and a few wrong peripheral objects appear. Only the default is correct.';
                    if (btn.dataset.difficulty === 'hard') diffDesc.textContent = 'Hard: Correct and more fake objects appear. Only the default is correct.';
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (diffDesc) diffDesc.textContent = '';
            });
        });
    }

    // Start button
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const keys = Object.keys(THEMES);
            ACTIVE_THEME = THEMES[keys[Math.floor(Math.random() * keys.length)]];
            applyTheme();
            startGame();
        });
    }
    
    // Setup game event listeners (choice buttons and peripheral positions)
    setupGameEventListeners();
}

function applyTheme() {
    // Apply background class
    const gameArea = document.getElementById('dd-gameArea');
    // Remove all possible theme classes before adding the new one
    gameArea.classList.remove('dd-theme-space', 'dd-theme-ocean', 'dd-theme-savanna');
    gameArea.classList.add(ACTIVE_THEME.backgroundClass);

    document.querySelectorAll('.dd-choice-btn').forEach((btn, index) => {
        const imageList = ACTIVE_THEME.centerObjects;
        const img = btn.querySelector('img');
        const sprite = imageList[index % imageList.length];
        btn.dataset.choice = sprite;
        img.src = sprite;
    });
    const prompt = document.getElementById('dd-clickPrompt');
    prompt.textContent = ACTIVE_THEME.clickPrompt;
}
// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
function initializeGame() {
    // Setup event listeners
    setupEventListeners();
    
    // Load saved state on page load (but don't auto-start)
    loadGameState();
    
    // Initialize UI
    updateScoreDisplay();
    updateProgressBar();
    
    // Show start screen (game area is hidden by default)
    if (startScreen) {
        startScreen.classList.remove('hidden');
    }
    const gameArea = document.getElementById('dd-gameArea');
    if (gameArea) {
        gameArea.classList.add('hidden');
    }
    
    // Reset game state
    gameState.currentRound = 1;
    gameState.totalAttempts = 0;
    gameState.correctAnswers = 0;
    gameState.displayTime = INITIAL_DISPLAY_TIME;
    gameState.centerChoice = null;
    gameState.peripheralChoice = null;
    gameState.gameActive = false;
    gameState.waitingForInput = false;
}

// Run initialization when DOM is ready
function setupSwitchGameHandler() {
    // Check if switchGame exists and hasn't been wrapped already
    if (typeof window.switchGame === 'function' && !window.switchGame._isWrapped) {
        const originalSwitchGame = window.switchGame;

        window.switchGame = function(gameName) {
            // Call the original switchGame function
            const result = originalSwitchGame(gameName);

            // Initialize Double Decision game if selected
            if (gameName === 'doubleDecision') {
                // Use setTimeout to ensure DOM is updated
                setTimeout(() => {
                    initializeGame();
                }, 100);
            }

            return result;
        };

        // Mark the function as wrapped to prevent multiple overrides
        window.switchGame._isWrapped = true;
    }
}

// Wait a bit to ensure switchGame is defined
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupSwitchGameHandler, 50);
    });
} else {
    // DOM is already loaded, wait a bit for switchGame to be defined
    setTimeout(setupSwitchGameHandler, 50);
}

// Expose initializeGame globally for standalone HTML usage
window.initializeGame = initializeGame;
function polarToXY(cx, cy, r, angRad) {
    return {x: cx + r * Math.cos(angRad), y: cy + r * Math.sin(angRad)};
}

function buildSectors(n = NUM_SECTORS) {
    const sectorsGroup = document.getElementById('dd-sectors');
    sectorsGroup.innerHTML = ''; // Clear existing sectors

    const cx = 500, cy = 500; // Center of the SVG
    const outerR = 460; // Outer radius
    const step = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
        const a1 = i * step - Math.PI / 2;
        const a2 = (i + 1) * step - Math.PI / 2;

        const x1 = cx + outerR * Math.cos(a1);
        const y1 = cy + outerR * Math.sin(a1);
        const x2 = cx + outerR * Math.cos(a2);
        const y2 = cy + outerR * Math.sin(a2);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} L ${x2} ${y2} Z`);
        path.setAttribute('class', 'dd-sector');
        path.dataset.sector = String(i);

        path.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!gameState.waitingForInput || gameState.peripheralChoice !== null) {
                return;
            }
            
            gameState.peripheralChoice = i;
            
            // Visual feedback
            path.classList.add('selected');
            
            // Disable other sectors
            const allSectors = document.querySelectorAll('.dd-sector');
            allSectors.forEach((otherSector, otherIndex) => {
                if (otherIndex !== i) {
                    otherSector.classList.add('sector-pointer-none', 'sector-opacity-half');
                    otherSector.classList.remove('sector-pointer-auto', 'sector-opacity-full');
                }
            });
            
            checkAnswers();
        });
        
        sectorsGroup.appendChild(path);
    }
}

function positionMoonInSector(sectorIndex) {
    if (!moonImg) return;
    const step = (2 * Math.PI) / NUM_SECTORS;
    const angle = (sectorIndex + 0.5) * step - Math.PI / 2;

    // Calculate position in percentage for absolute positioning
    // SVG viewBox is 0-1000, convert to percentage
    // Reduced radius to 28% to keep larger moon within bounds
    const cx = 50; // 50% (center)
    const cy = 50; // 50% (center)
    const r = 28; // 28% from center (reduced from 36% to account for larger moon size)
    const xPercent = cx + (r * Math.cos(angle));
    const yPercent = cy + (r * Math.sin(angle));
  
    moonImg.style.left = `${xPercent}%`;
    moonImg.style.top = `${yPercent}%`;
    moonImg.style.transform = 'translate(-50%, -50%)';
    // Show correct image for theme
    if (ACTIVE_THEME === THEMES.space) {
        moonImg.src = 'img/moon.png';
    } else if (ACTIVE_THEME === THEMES.ocean) {
        moonImg.src = 'img/dolphin.png';
    } else if (ACTIVE_THEME === THEMES.savanna) {
        moonImg.src = 'img/impala.png';
    }
    moonImg.classList.remove('moon-hidden');
    moonImg.classList.add('moon-visible');
}
})(); // End of IIFE

