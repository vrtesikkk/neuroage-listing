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

// ============================================================================
// GAME CONFIGURATION - Easy to adjust values
// ============================================================================

// Number of sectors (8 triangular sectors)
const NUM_SECTORS = 8;

// ═══════════════════════════════════════════════════════════════════
// SPAWN ZONE CONFIGURATION - Coordinate System Unified
// ═══════════════════════════════════════════════════════════════════
// All systems use a single coordinate reference:
// - SVG sectors: viewBox="0 0 1000 1000", center=(500, 500), radius=500
// - CSS percentages: 0%=0, 50%=500, 100%=1000 (maps 1:1 with SVG)
// - Spawn radii are in percentage units that map directly to this space
// ═══════════════════════════════════════════════════════════════════
const MIN_SPAWN_RADIUS = 15; // Minimum distance from center (in %, maps to 150 in SVG viewBox)
const MAX_SPAWN_RADIUS = 22; // Maximum distance from center (in %, maps to 300 in SVG viewBox)
const ZONE_RADIUS = (MIN_SPAWN_RADIUS + MAX_SPAWN_RADIUS) / 2; // Center of spawn band for TRUE objects
const OBJECT_PIXEL_SIZE = 48; // Peripheral object size in pixels
const CONTAINER_PIXEL_SIZE = 500; // Game area width in pixels (for angular margin calculation)

// Object types for center and peripheral display
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
const INITIAL_DISPLAY_TIME = 1100;

// Minimum and maximum display times (in milliseconds)
const MIN_DISPLAY_TIME = 200;
const MAX_DISPLAY_TIME = 1000;

// Difficulty adjustment step (how much to increase/decrease time)
const DIFFICULTY_STEP = 100;

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

// =============================
// SECTOR-INDEX-BASED PERIPHERAL OBJECT SPAWNING SYSTEM
// =============================

// ============================================================================
// DETERMINISTIC SECTOR-BASED SPAWN SYSTEM
// Guarantees exactly ONE object per sector with NO boundary overlap
// ============================================================================

/**
 * Spawns peripheral objects for the round based on difficulty
 * GUARANTEE: Each object gets exactly ONE unique sector
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {Array} Array of objects: { type: 'correct'|'fake', img: string, sectorIndex: number }
 */
function spawnPeripheralObjects(difficulty) {
    console.log(`\n━━━ SPAWN SYSTEM START ━━━`);
    console.log(`Difficulty: ${difficulty}`);

    // STEP 1: Determine object count based on difficulty (DO NOT CHANGE)
    let objectCount;
    switch (difficulty) {
        case 'easy':   objectCount = 1; break;  // 1 correct
        case 'medium': objectCount = 4; break;  // 1 correct + 3 fake
        case 'hard':   objectCount = 8; break;  // 1 correct + 7 fake
        default:       objectCount = 1; break;
    }

    console.log(`Object count: ${objectCount}`);

    // STEP 2: Create sector pool and shuffle (Fisher-Yates)
    // This GUARANTEES each sector is used at most once
    const sectorPool = [];
    for (let i = 0; i < NUM_SECTORS; i++) {
        sectorPool.push(i);
    }

    // Shuffle using Fisher-Yates algorithm
    for (let i = sectorPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sectorPool[i], sectorPool[j]] = [sectorPool[j], sectorPool[i]];
    }

    console.log(`Shuffled sector pool: [${sectorPool.join(', ')}]`);

    // STEP 3: Assign objects to sectors from the shuffled pool
    const objects = [];
    const correctImg = ACTIVE_THEME.peripheralObject;
    const fakeImgs = ACTIVE_THEME.fakePeripheralObjects || [];

    for (let i = 0; i < objectCount; i++) {
        const assignedSector = sectorPool[i];
        const isCorrect = (i === 0); // First object is always correct
        const img = isCorrect ? correctImg : fakeImgs[Math.floor(Math.random() * fakeImgs.length)];

        objects.push({
            type: isCorrect ? 'correct' : 'fake',
            img: img,
            sectorIndex: assignedSector
        });

        console.log(`  [${i}] ${isCorrect ? '✓ TRUE' : '✗ FAKE'} → Sector ${assignedSector}`);
    }

    // STEP 4: Verification (paranoid check)
    const assignedSectors = objects.map(o => o.sectorIndex);
    const uniqueCheck = new Set(assignedSectors);

    if (assignedSectors.length !== uniqueCheck.size) {
        console.error('━━━ CRITICAL ERROR ━━━');
        console.error('DUPLICATE SECTORS DETECTED!');
        console.error('Assigned:', assignedSectors);
        console.error('Unique:', Array.from(uniqueCheck));
        throw new Error('Spawn system integrity violation: duplicate sectors');
    }

    console.log(`✅ Verification passed: ${assignedSectors.length} unique sectors`);

    // CRITICAL VERIFICATION: Ensure we have exactly one correct object
    const correctObjects = objects.filter(o => o.type === 'correct');
    if (correctObjects.length !== 1) {
        console.error('━━━ CRITICAL ERROR ━━━');
        console.error(`WRONG NUMBER OF CORRECT OBJECTS: ${correctObjects.length} (expected: 1)`);
        console.error('All objects:', objects);
        throw new Error(`Spawn integrity violation: ${correctObjects.length} correct objects (expected 1)`);
    }

    console.log(`✅ Correct object verified: Sector ${correctObjects[0].sectorIndex}`);
    console.log(`━━━ SPAWN SYSTEM END ━━━\n`);

    return objects;
}

/**
 * Converts sector index to screen position using PURE POLAR COORDINATES
 * GUARANTEE: Object center will NEVER touch sector boundaries
 * @param {number} sectorIndex - Sector number (0 to NUM_SECTORS-1)
 * @param {boolean} isCorrect - True = center of sector, False = random within sector
 * @returns {object} {left, top, transform} in percentage units
 */
function getPositionFromSector(sectorIndex, isCorrect = true) {
    // ════════════════════════════════════════════════════════════════════════
    // COORDINATE SYSTEM ALIGNMENT
    // ════════════════════════════════════════════════════════════════════════
    // SVG sectors are built with: angle_i = i * (2π/N) - π/2
    // This makes sector 0 point UP (top of screen)
    // We MUST use the exact same system to avoid misalignment

    const sectorAngle = (2 * Math.PI) / NUM_SECTORS;  // Angle width of each sector
    const epsilon = 1e-10;  // Floating-point safety margin

    // Sector boundaries (screen-space, -π/2 offset makes 0° point up)
    const sectorStart = sectorIndex * sectorAngle - Math.PI / 2;
    const sectorEnd = (sectorIndex + 1) * sectorAngle - Math.PI / 2;
    const sectorCenter = sectorStart + sectorAngle / 2;

    // ════════════════════════════════════════════════════════════════════════
    // ANGULAR MARGIN CALCULATION (Object Hitbox)
    // ════════════════════════════════════════════════════════════════════════
    // Calculate how much angular space the 48px object occupies at spawn radius
    const radiusInPixels = (ZONE_RADIUS / 100) * CONTAINER_PIXEL_SIZE;
    const halfObjectAngle = Math.atan2(OBJECT_PIXEL_SIZE / 2, radiusInPixels);

    // Safety margin: 4x the half-width to ensure clear separation from boundaries
    const angularMargin = halfObjectAngle * 4 + epsilon;

    // ════════════════════════════════════════════════════════════════════════
    // ANGLE SELECTION
    // ════════════════════════════════════════════════════════════════════════
    let angle, radius;

    if (isCorrect) {
        // TRUE OBJECT: Exact mathematical center of sector
        angle = sectorCenter;
        radius = ZONE_RADIUS;

        console.log(`  ✓ Sector ${sectorIndex} TRUE: θ=${(angle * 180 / Math.PI).toFixed(2)}° (corrected), r=${radius.toFixed(1)}%`);
        console.log(`     sectorStart=${(sectorStart * 180 / Math.PI).toFixed(2)}°, sectorEnd=${(sectorEnd * 180 / Math.PI).toFixed(2)}°`);
    } else {
        // FAKE OBJECT: Random position STRICTLY INSIDE sector boundaries
        const safeStart = sectorStart + angularMargin;
        const safeEnd = sectorEnd - angularMargin;
        const safeRange = safeEnd - safeStart;

        if (safeRange <= epsilon) {
            // Sector too narrow for safe random placement - use center
            console.warn(`  ⚠ Sector ${sectorIndex} too narrow, using center`);
            angle = sectorCenter;
            radius = ZONE_RADIUS;
        } else {
            // Generate random angle strictly within safe bounds
            const randomFraction = Math.random();  // [0, 1)
            angle = safeStart + randomFraction * safeRange;

            // Random radius within spawn band
            radius = MIN_SPAWN_RADIUS + Math.random() * (MAX_SPAWN_RADIUS - MIN_SPAWN_RADIUS);

            console.log(`  ✗ Sector ${sectorIndex} FAKE: θ=${(angle * 180 / Math.PI).toFixed(2)}°, r=${radius.toFixed(1)}%`);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // BOUNDARY VIOLATION CHECK (Paranoid verification)
    // ════════════════════════════════════════════════════════════════════════
    const objectLeft = angle - halfObjectAngle;
    const objectRight = angle + halfObjectAngle;

    if (objectLeft < sectorStart - epsilon || objectRight > sectorEnd + epsilon) {
        console.error(`  ❌ BOUNDARY VIOLATION in sector ${sectorIndex}!`);
        console.error(`     Object span: [${(objectLeft * 180 / Math.PI).toFixed(2)}°, ${(objectRight * 180 / Math.PI).toFixed(2)}°]`);
        console.error(`     Sector span: [${(sectorStart * 180 / Math.PI).toFixed(2)}°, ${(sectorEnd * 180 / Math.PI).toFixed(2)}°]`);
        // Emergency fallback: force to center
        angle = sectorCenter;
        radius = ZONE_RADIUS;
    }

    // ════════════════════════════════════════════════════════════════════════
    // POLAR → CARTESIAN CONVERSION WITH ASPECT RATIO CORRECTION
    // ════════════════════════════════════════════════════════════════════════
    // Get the actual game area dimensions to calculate aspect ratio
    const gameArea = document.getElementById('dd-gameArea');
    let aspectRatio = 1.0; // Default to square

    if (gameArea) {
        const rect = gameArea.getBoundingClientRect();
        if (rect.height > 0) {
            aspectRatio = rect.width / rect.height;
            console.log(`  Aspect ratio: ${aspectRatio.toFixed(3)} (${rect.width}px / ${rect.height}px)`);
        }
    }

    // Center coordinates in percentage space
    const cx = 50;
    const cy = 45; // Moved up from 50% to center the spawn circle on the grid

    // Convert polar (angle, radius) to Cartesian (x%, y%)
    // CRITICAL: Apply aspect ratio correction to ensure circular spawn pattern
    // If container is wider than tall (aspectRatio > 1), REDUCE X percentage
    // If container is taller than wide (aspectRatio < 1), INCREASE X percentage
    // This ensures the same pixel distance in both directions = perfect circle
    const radiusX = radius / aspectRatio; // X radius compressed when container is wide
    const radiusY = radius;                // Y radius stays the same

    const x = cx + radiusX * Math.cos(angle);
    const y = cy + radiusY * Math.sin(angle);

    console.log(`    Final position: (${x.toFixed(2)}%, ${y.toFixed(2)}%)`);

    return {
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)'  // Center the object on the calculated point
    };
}
// Returns true if the sector contains at least one correct object
function isSectorCorrect(objects, sectorIndex) {
    if (!objects || !Array.isArray(objects)) {
        console.error('isSectorCorrect: objects is not an array', objects);
        return false;
    }

    // Ensure sectorIndex is a number for strict comparison
    const sectorNum = typeof sectorIndex === 'number' ? sectorIndex : parseInt(sectorIndex, 10);

    if (isNaN(sectorNum)) {
        console.error('isSectorCorrect: invalid sectorIndex', sectorIndex);
        return false;
    }

    // Find the object(s) in the clicked sector
    const objectsInSector = objects.filter(obj => obj.sectorIndex === sectorNum);
    const correctObjectsInSector = objectsInSector.filter(obj => obj.type === 'correct');

    const result = correctObjectsInSector.length > 0;

    // Debug logging with detailed breakdown
    console.log(`\n━━━ SECTOR CHECK DETAILS ━━━`);
    console.log(`Clicked sector: ${sectorNum}`);
    console.log(`Objects in clicked sector:`, objectsInSector.length === 0 ? 'NONE!' : objectsInSector.map(o => `${o.type} (img: ${o.img})`).join(', '));
    console.log(`Correct objects in clicked sector:`, correctObjectsInSector.length);
    console.log(`Result: ${result ? '✓ CORRECT SECTOR' : '✗ WRONG SECTOR'}`);
    console.log(`\nAll objects this round:`);
    objects.forEach(o => {
        const isClickedSector = o.sectorIndex === sectorNum;
        console.log(`  Sector ${o.sectorIndex}: ${o.type}${isClickedSector ? ' ← YOU CLICKED THIS' : ''}${o.type === 'correct' ? ' ← CORRECT OBJECT IS HERE' : ''}`);
    });

    return result;
}

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

    // Generate peripheral objects for this round
    const peripheralObjects = spawnPeripheralObjects(gameState.selectedDifficulty);
    gameState.peripheralObjectsThisRound = peripheralObjects;

    // Verification: Log what was stored
    console.log(`\n✅ Stored ${peripheralObjects.length} objects in gameState.peripheralObjectsThisRound`);
    console.log(`Correct object is in sector:`, peripheralObjects.find(o => o.type === 'correct')?.sectorIndex);

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
        }, 400);
    }, gameState.displayTime + 200);
}

/**
 * Renders peripheral objects to screen - ATOMIC OPERATION
 * Guarantees exactly one render per call with complete cleanup
 * @param {Array} peripheralObjects - Array of {type, img, sectorIndex}
 */
function positionPeripheralObjectsInSectors(peripheralObjects) {
    console.log('\n━━━ RENDER SYSTEM START ━━━');
    console.log(`Objects to render: ${peripheralObjects.length}`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: ATOMIC CLEANUP
    // ═══════════════════════════════════════════════════════════════════
    // Remove ALL old peripheral containers (paranoid multi-selector cleanup)
    const oldContainers = document.querySelectorAll('#dd-peripheralContainer, [id^="dd-peripheral"]');
    if (oldContainers.length > 0) {
        console.log(`  Removing ${oldContainers.length} old container(s)...`);
        oldContainers.forEach(old => old.remove());
    }

    // Wait for DOM cleanup (force synchronous)
    const checkCleanup = document.querySelectorAll('#dd-peripheralContainer');
    if (checkCleanup.length > 0) {
        console.error('  ❌ Cleanup failed! Old containers still present');
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: CREATE FRESH CONTAINER
    // ═══════════════════════════════════════════════════════════════════
    const container = document.createElement('div');
    container.id = 'dd-peripheralContainer';
    container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
    `;

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3: RENDER OBJECTS
    // ═══════════════════════════════════════════════════════════════════
    const renderedSectors = new Set();

    peripheralObjects.forEach((obj) => {
        // Duplicate sector check (should NEVER happen with correct spawn logic)
        if (renderedSectors.has(obj.sectorIndex)) {
            console.error(`━━━ RENDER ERROR ━━━`);
            console.error(`Duplicate render attempt for sector ${obj.sectorIndex}!`);
            console.error(`This indicates spawn system failure.`);
            throw new Error(`Render integrity violation: sector ${obj.sectorIndex} used twice`);
        }
        renderedSectors.add(obj.sectorIndex);

        // Get position using deterministic polar math
        const isCorrect = obj.type === 'correct';
        const pos = getPositionFromSector(obj.sectorIndex, isCorrect);

        // Create image element
        const img = document.createElement('img');
        img.src = obj.img;
        img.className = 'moon-visible dd-peripheral-img';
        img.style.cssText = `
            position: absolute;
            left: ${pos.left};
            top: ${pos.top};
            transform: translate(-50%, -50%);
            width: 48px;
            height: 48px;
            pointer-events: none;
        `;
        img.dataset.sector = obj.sectorIndex;
        img.dataset.type = obj.type;

        container.appendChild(img);
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4: ATTACH TO DOM (ATOMIC)
    // ═══════════════════════════════════════════════════════════════════
    const gameArea = document.getElementById('dd-gameArea');
    if (!gameArea) {
        console.error('❌ Game area not found!');
        return;
    }

    gameArea.appendChild(container);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 5: VERIFICATION
    // ═══════════════════════════════════════════════════════════════════
    const renderedCount = container.children.length;
    const expectedCount = peripheralObjects.length;

    console.log(`  Rendered: ${renderedCount} objects`);
    console.log(`  Sectors used: [${Array.from(renderedSectors).sort((a,b) => a-b).join(', ')}]`);

    if (renderedCount !== expectedCount) {
        console.error(`━━━ RENDER ERROR ━━━`);
        console.error(`Expected ${expectedCount} objects, rendered ${renderedCount}`);
    } else {
        console.log(`  ✅ Render verification passed`);
    }

    console.log(`━━━ RENDER SYSTEM END ━━━\n`);
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

    // Debug: Log the state before checking
    console.log('\n━━━ PRE-CHECK VERIFICATION ━━━');
    console.log(`gameState.peripheralObjectsThisRound:`, gameState.peripheralObjectsThisRound);
    console.log(`gameState.peripheralChoice (clicked sector):`, gameState.peripheralChoice, `(type: ${typeof gameState.peripheralChoice})`);
    console.log(`gameState.centerChoice:`, gameState.centerChoice);
    console.log(`gameState.centerObject:`, gameState.centerObject);

    // CRITICAL: Verify objects array is valid
    if (!gameState.peripheralObjectsThisRound || !Array.isArray(gameState.peripheralObjectsThisRound)) {
        console.error('━━━ CRITICAL ERROR ━━━');
        console.error('peripheralObjectsThisRound is invalid!', gameState.peripheralObjectsThisRound);
        alert('Game error: No objects in this round. Please restart the game.');
        return;
    }

    if (gameState.peripheralObjectsThisRound.length === 0) {
        console.error('━━━ CRITICAL ERROR ━━━');
        console.error('peripheralObjectsThisRound is empty!');
        alert('Game error: Empty objects array. Please restart the game.');
        return;
    }

    // Center answer is correct if matches center object
    const centerCorrect = gameState.centerChoice === gameState.centerObject;

    // Peripheral answer is correct if the chosen sector contains at least one correct object
    let peripheralCorrect = isSectorCorrect(gameState.peripheralObjectsThisRound, gameState.peripheralChoice);

    const bothCorrect = centerCorrect && peripheralCorrect;

    // Debug logging for troubleshooting
    console.log('━━━ ANSWER CHECK ━━━');
    console.log(`Center: ${centerCorrect ? '✓ CORRECT' : '✗ WRONG'} (chose: ${gameState.centerChoice}, correct: ${gameState.centerObject})`);
    console.log(`Sector: ${peripheralCorrect ? '✓ CORRECT' : '✗ WRONG'} (clicked sector: ${gameState.peripheralChoice})`);
    console.log(`Result: ${bothCorrect ? '✓ BOTH CORRECT' : '✗ TRY AGAIN'}`);

    // Visual feedback with detailed information
    if (clickPrompt) {
        if (bothCorrect) {
            clickPrompt.textContent = '✓ Both correct!';
            clickPrompt.classList.add('text-green-600');
        } else {
            // Provide specific feedback about what went wrong
            if (!centerCorrect && !peripheralCorrect) {
                clickPrompt.textContent = '✗ Both wrong - try again!';
            } else if (!centerCorrect) {
                clickPrompt.textContent = '✗ Wrong center object - try again!';
            } else if (!peripheralCorrect) {
                clickPrompt.textContent = '✗ Wrong sector - try again!';
            }
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
    // showSafeZoneDebug(); // Visual debug: shows safe spawn zones (disabled for clean game)

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
    const sectorSvg = document.getElementById('dd-sectorSvg');

    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL: Establish explicit SVG coordinate system
    // ═══════════════════════════════════════════════════════════════════
    // viewBox="0 0 1000 1000" creates a coordinate space where:
    // - Center is (500, 500)
    // - Full radius 500 fills the viewBox
    // - This maps 1:1 with percentage space: 0%=0, 50%=500, 100%=1000
    if (sectorSvg) {
        sectorSvg.setAttribute('viewBox', '0 0 1000 1000');
        sectorSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    sectorsGroup.innerHTML = ''; // Clear existing sectors

    const cx = 500, cy = 500; // Center of the 1000x1000 viewBox
    const outerR = 500; // Outer radius (fills to edge of viewBox)
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

        // Debug: Log SVG sector angles to compare with spawn calculations
        const sectorCenterAngle = (a1 + a2) / 2;
        console.log(`SVG Sector ${i}: a1=${(a1 * 180 / Math.PI).toFixed(1)}°, a2=${(a2 * 180 / Math.PI).toFixed(1)}°, center=${(sectorCenterAngle * 180 / Math.PI).toFixed(1)}°`);

        path.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!gameState.waitingForInput || gameState.peripheralChoice !== null) {
                return;
            }

            // Use dataset to avoid closure issues and ensure correct sector number
            const clickedSectorNum = parseInt(e.currentTarget.dataset.sector, 10);
            gameState.peripheralChoice = clickedSectorNum;

            // Visual feedback
            path.classList.add('selected');

            // Disable other sectors
            const allSectors = document.querySelectorAll('.dd-sector');
            allSectors.forEach((otherSector) => {
                const otherSectorNum = parseInt(otherSector.dataset.sector, 10);
                if (otherSectorNum !== clickedSectorNum) {
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
window.positionMoonInSector = positionMoonInSector;

/**
 * Visual debugging overlay - shows spawn zones and sector boundaries
 * Updated to match the deterministic spawn system
 */
function showSafeZoneDebug() {
    console.log('━━━ VISUAL DEBUG SYSTEM ━━━');

    // Remove old debug overlay
    const oldDebug = document.querySelectorAll('#dd-safeZoneDebug');
    oldDebug.forEach(old => old.remove());

    const container = document.createElement('div');
    container.id = 'dd-safeZoneDebug';
    container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    `;

    const sectorAngle = (2 * Math.PI) / NUM_SECTORS;
    const radiusInPixels = (ZONE_RADIUS / 100) * CONTAINER_PIXEL_SIZE;
    const halfAngularWidth = Math.atan2(OBJECT_PIXEL_SIZE / 2, radiusInPixels);
    const angularMargin = halfAngularWidth * 4;  // Match the 4x margin from spawn logic

    // ═══════════════════════════════════════════════════════════════════
    // SVG LAYER: Spawn radius circles
    // ═══════════════════════════════════════════════════════════════════
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.setAttribute('viewBox', '0 0 100 100');

    // Inner spawn circle (moved up to match spawn center)
    const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    innerCircle.setAttribute('cx', '50');
    innerCircle.setAttribute('cy', '45'); // Moved up from 50 to center on grid
    innerCircle.setAttribute('r', String(MIN_SPAWN_RADIUS));
    innerCircle.setAttribute('fill', 'none');
    innerCircle.setAttribute('stroke', 'rgba(0, 255, 255, 0.4)');
    innerCircle.setAttribute('stroke-width', '0.4');
    innerCircle.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(innerCircle);

    // Outer spawn circle (moved up to match spawn center)
    const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outerCircle.setAttribute('cx', '50');
    outerCircle.setAttribute('cy', '45'); // Moved up from 50 to center on grid
    outerCircle.setAttribute('r', String(MAX_SPAWN_RADIUS));
    outerCircle.setAttribute('fill', 'none');
    outerCircle.setAttribute('stroke', 'rgba(0, 255, 255, 0.4)');
    outerCircle.setAttribute('stroke-width', '0.4');
    outerCircle.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(outerCircle);

    container.appendChild(svg);

    // ═══════════════════════════════════════════════════════════════════
    // SECTOR MARKERS (with aspect ratio correction)
    // ═══════════════════════════════════════════════════════════════════
    // Get aspect ratio for circular positioning
    const gameArea = document.getElementById('dd-gameArea');
    let aspectRatio = 1.0;
    if (gameArea) {
        const rect = gameArea.getBoundingClientRect();
        if (rect.height > 0) {
            aspectRatio = rect.width / rect.height;
        }
    }

    for (let i = 0; i < NUM_SECTORS; i++) {
        const sectorStart = i * sectorAngle - Math.PI / 2;
        const sectorEnd = (i + 1) * sectorAngle - Math.PI / 2;
        const sectorCenter = sectorStart + sectorAngle / 2;

        const safeStart = sectorStart + angularMargin;
        const safeEnd = sectorEnd - angularMargin;

        // TRUE object spawn point (sector center, green dot)
        // Apply aspect ratio correction for circular positioning
        const centerX = 50 + (ZONE_RADIUS / aspectRatio) * Math.cos(sectorCenter);
        const centerY = 50 + ZONE_RADIUS * Math.sin(sectorCenter);

        const centerDot = document.createElement('div');
        centerDot.style.cssText = `
            position: absolute;
            left: ${centerX}%;
            top: ${centerY}%;
            width: 8px;
            height: 8px;
            background: lime;
            border: 1px solid darkgreen;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 6px lime;
        `;
        container.appendChild(centerDot);

        // Safe zone boundary markers (red dots at multiple radii)
        for (let r = MIN_SPAWN_RADIUS; r <= MAX_SPAWN_RADIUS; r += 7) {
            // Left boundary (with aspect ratio correction)
            const leftX = 50 + (r / aspectRatio) * Math.cos(safeStart);
            const leftY = 50 + r * Math.sin(safeStart);
            const leftDot = document.createElement('div');
            leftDot.style.cssText = `
                position: absolute;
                left: ${leftX}%;
                top: ${leftY}%;
                width: 3px;
                height: 3px;
                background: red;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                opacity: 0.7;
            `;
            container.appendChild(leftDot);

            // Right boundary (with aspect ratio correction)
            const rightX = 50 + (r / aspectRatio) * Math.cos(safeEnd);
            const rightY = 50 + r * Math.sin(safeEnd);
            const rightDot = document.createElement('div');
            rightDot.style.cssText = `
                position: absolute;
                left: ${rightX}%;
                top: ${rightY}%;
                width: 3px;
                height: 3px;
                background: red;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                opacity: 0.7;
            `;
            container.appendChild(rightDot);
        }

        // Sector number label (with aspect ratio correction)
        const labelRadius = MAX_SPAWN_RADIUS + 7;
        const labelX = 50 + (labelRadius / aspectRatio) * Math.cos(sectorCenter);
        const labelY = 50 + labelRadius * Math.sin(sectorCenter);
        const label = document.createElement('div');
        label.textContent = i;
        label.style.cssText = `
            position: absolute;
            left: ${labelX}%;
            top: ${labelY}%;
            transform: translate(-50%, -50%);
            color: white;
            font-weight: bold;
            font-size: 16px;
            text-shadow:
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 4px #000;
        `;
        container.appendChild(label);
    }

    // ═══════════════════════════════════════════════════════════════════
    // LEGEND
    // ═══════════════════════════════════════════════════════════════════
    const legend = document.createElement('div');
    legend.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 10px;
        font-size: 11px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-family: monospace;
    `;
    legend.innerHTML = `
        <div style="margin-bottom: 4px; font-weight: bold; color: cyan;">SPAWN SYSTEM DEBUG</div>
        <div><span style="color: lime;">●</span> TRUE spawn (sector center)</div>
        <div><span style="color: red;">●</span> Safe zone boundaries</div>
        <div><span style="color: cyan;">○</span> Spawn band: ${MIN_SPAWN_RADIUS}%-${MAX_SPAWN_RADIUS}%</div>
        <div style="font-size: 9px; margin-top: 4px; color: #aaa;">
            FAKE objects: between red dots<br>
            Margin: 4× object half-width
        </div>
    `;
    container.appendChild(legend);

    document.getElementById('dd-gameArea').appendChild(container);
    console.log('Visual debug overlay created');
}

})(); // End of IIFE

