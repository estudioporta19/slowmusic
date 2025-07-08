// --- Global Audio Context & Metronome State ---
let audioContext;
let isPlaying = false; // Overall playing state for the app
let lookahead = 25.0; // milliseconds: How often to call the scheduler (25ms)
let scheduleAheadTime = 0.1; // seconds: How far ahead to schedule audio (100ms)
let intervalId; // ID for the setInterval loop

let activeMode = 'classic'; // 'classic', 'clave', 'list' (future)

// --- GLOBAL BPM State ---
let currentBPM = 120; // BPM is now global

// --- Classic Metronome Module State ---
let timeNumerator = 4; // Top number of time signature (e.g., 4 in 4/4)
let timeDenominator = 4; // Bottom number of time signature (e.g., 4 in 4/4)
let subdivisionType = 1; // 1 = none, 2 = 8th notes, 3 = 12th notes (triplets), 4 = 16th notes
let compoundSubdivisions = []; // e.g., [4, 3] for 7/4. Empty if simple time.
let accentedBeats = new Set(); // NEW: Set of beats to accent (e.g., {3, 5, 7})

let nextClassicClickTime = 0.0;
let currentClassicBeat = 0; // Current beat within the measure (0-indexed)
let currentClassicSubdivision = 0; // Current subdivision within the beat (0-indexed)

// --- Clave Designer Module State ---
const CLAVE_OFF = 0;
const CLAVE_BEAT_1 = 1; // Strong click type for Clave Designer
const CLAVE_BEAT_2 = 2; // Medium click type for Clave Designer

let clavePattern = new Array(16).fill(CLAVE_OFF); // 16 semicolches grid
let claveCycleLength = 16; // User-defined length for the clave pattern loop (1 to 16)
let nextClaveClickTime = 0.0;
let currentClaveIndex = 0; // Current index in the 16-semicolcheia pattern

// --- DOM Elements ---
// Global BPM Control
const bpmSlider = document.getElementById('bpmSlider');
const bpmValueDisplay = document.getElementById('bpmValue');

// Mode Selector Buttons
const modeClassicBtn = document.getElementById('modeClassicBtn');
const modeClaveBtn = document.getElementById('modeClaveBtn');
const modeListBtn = document.getElementById('modeListBtn');

// Module Containers
const classicMetronomeModule = document.getElementById('classicMetronomeModule');
const claveDesignerModule = document.getElementById('claveDesignerModule');
const listMetronomeModule = document.getElementById('listMetronomeModule');

// Classic Metronome Controls
const timeNumeratorInput = document.getElementById('timeNumerator');
const timeNumeratorValueDisplay = document.getElementById('timeNumeratorValue');
const timeDenominatorSelect = document.getElementById('timeDenominator');
const compoundSubdivisionsInput = document.getElementById('compoundSubdivisions');
const compoundTimeGroup = document.getElementById('compoundTimeGroup');
const accentedBeatsInput = document.getElementById('accentedBeats'); // NEW

const subdivisionOffBtn = document.getElementById('subdivisionOffBtn');
const subdivision2Btn = document.getElementById('subdivision2Btn');
const subdivision3Btn = document.getElementById('subdivision3Btn');
const subdivision4Btn = document.getElementById('subdivision4Btn');

// Clave Designer Controls
const claveGrid = document.getElementById('claveGrid');
const claveCycleLengthSlider = document.getElementById('claveCycleLength');
const claveCycleLengthValueDisplay = document.getElementById('claveCycleLengthValue');

// Global Controls
const metronomeStatusDisplay = document.getElementById('metronomeStatus');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');


// --- Audio Generation Functions ---

/**
 * Creates and schedules a click sound using the Web Audio API.
 * @param {number} frequency - The frequency of the oscillator.
 * @param {number} duration - The duration of the sound in seconds.
 * @param {number} volume - The gain (volume) of the sound.
 * @param {number} startTime - The exact time in AudioContext's clock to play the sound.
 */
function createClickSound(frequency, duration, volume, startTime) {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Quick decay

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
    };
}

// --- UI Update & Logic Functions (Global BPM) ---
function updateBPMDisplay() {
    currentBPM = parseInt(bpmSlider.value);
    bpmValueDisplay.textContent = currentBPM;
    resetAndSchedule();
}

// --- UI Update & Logic Functions (Classic Metronome) ---

function updateTimeSignature() {
    timeNumerator = parseInt(timeNumeratorInput.value);
    timeNumeratorValueDisplay.textContent = timeNumerator;
    timeDenominator = parseInt(timeDenominatorSelect.value);
    
    // Show/hide compound time input based on numerator
    if (timeNumerator > 4 && timeNumerator !== 6 && timeNumerator !== 9 && timeNumerator !== 12) { // Typically irregular meters
        compoundTimeGroup.style.display = 'flex';
    } else {
        compoundTimeGroup.style.display = 'none';
        compoundSubdivisionsInput.value = ''; // Clear input
        compoundSubdivisions = []; // Clear array
    }

    resetAndSchedule();
}

function parseCompoundSubdivisions() {
    const input = compoundSubdivisionsInput.value.trim();
    if (!input) {
        compoundSubdivisions = [];
        return;
    }
    const parts = input.split('+').map(p => parseInt(p.trim()));
    if (parts.every(p => !isNaN(p) && p > 0) && parts.reduce((sum, val) => sum + val, 0) === timeNumerator) {
        compoundSubdivisions = parts;
    } else {
        compoundSubdivisions = [];
        alert('Formato de compasso composto inválido. Use apenas números inteiros e garanta que a soma é igual ao número de tempos.');
        compoundSubdivisionsInput.value = '';
    }
    resetAndSchedule();
}

function parseAccentedBeats() {
    const input = accentedBeatsInput.value.trim();
    accentedBeats.clear(); // Clear previous accents
    if (!input) {
        return;
    }
    const parts = input.split(',').map(p => parseInt(p.trim()));
    for (const beat of parts) {
        if (!isNaN(beat) && beat > 1 && beat <= timeNumerator) { // Beat must be > 1 and within measure
            accentedBeats.add(beat - 1); // Store as 0-indexed
        }
    }
    resetAndSchedule();
}

function updateSubdivisionButtons() {
    subdivisionOffBtn.classList.remove('selected');
    subdivision2Btn.classList.remove('selected');
    subdivision3Btn.classList.remove('selected');
    subdivision4Btn.classList.remove('selected');

    if (subdivisionType === 1) subdivisionOffBtn.classList.add('selected');
    else if (subdivisionType === 2) subdivision2Btn.classList.add('selected');
    else if (subdivisionType === 3) subdivision3Btn.classList.add('selected');
    else if (subdivisionType === 4) subdivision4Btn.classList.add('selected');

    resetAndSchedule();
}

// --- UI Update & Logic Functions (Clave Designer) ---

function updateClaveCycleLength() {
    claveCycleLength = parseInt(claveCycleLengthSlider.value);
    claveCycleLengthValueDisplay.textContent = claveCycleLength;
    renderClaveGrid(); // Re-render to show active/inactive points
    resetAndSchedule();
}

// Initializes the clave pattern with default strong beats based on 4/4 (for 16 semicolches)
function initializeClavePatternDefault() {
    clavePattern = new Array(16).fill(CLAVE_OFF);
    // Default 4/4 accents (every 4 semicolches)
    clavePattern[0] = CLAVE_BEAT_1;
    clavePattern[4] = CLAVE_BEAT_2;
    clavePattern[8] = CLAVE_BEAT_2;
    clavePattern[12] = CLAVE_BEAT_2;
}

function renderClaveGrid() {
    claveGrid.innerHTML = ''; // Clear existing grid

    for (let i = 0; i < 16; i++) {
        const point = document.createElement('div');
        point.classList.add('clave-point');
        point.dataset.index = i;

        // Apply visual classes based on pattern value
        if (clavePattern[i] === CLAVE_BEAT_1) {
            point.classList.add('beat-1');
            point.textContent = '1';
        } else if (clavePattern[i] === CLAVE_BEAT_2) {
            point.classList.add('beat-2');
            point.textContent = '•';
        } else {
            point.classList.add('beat-0');
            point.textContent = '';
        }

        // Visually gray out points beyond the current claveCycleLength
        if (i >= claveCycleLength) {
            point.classList.add('inactive-clave-point');
        } else {
            point.classList.remove('inactive-clave-point');
        }

        // Toggle pattern value on click
        point.addEventListener('click', () => {
            // Only allow clicking on active points
            if (i < claveCycleLength) {
                if (clavePattern[i] === CLAVE_OFF) {
                    clavePattern[i] = CLAVE_BEAT_1;
                    point.classList.remove('beat-0');
                    point.classList.add('beat-1');
                    point.textContent = '1';
                } else if (clavePattern[i] === CLAVE_BEAT_1) {
                    clavePattern[i] = CLAVE_BEAT_2;
                    point.classList.remove('beat-1');
                    point.classList.add('beat-2');
                    point.textContent = '•';
                } else {
                    clavePattern[i] = CLAVE_OFF;
                    point.classList.remove('beat-2');
                    point.classList.add('beat-0');
                    point.textContent = '';
                }
            }
        });

        claveGrid.appendChild(point);
    }
}

// --- Global UI Update (Status Display) ---
function updateMetronomeStatus() {
    if (isPlaying) {
        let statusText = '';
        if (activeMode === 'classic') {
            statusText += `Clássico: ${currentClassicBeat + 1}/${timeNumerator}`;
            if (subdivisionType > 1) {
                statusText += `.${currentClassicSubdivision + 1}`;
            }
        } else if (activeMode === 'clave') {
            statusText += `Clave: ${currentClaveIndex + 1}/${claveCycleLength}`;
        } else if (activeMode === 'list') {
            statusText += `Lista: (Em Breve)`;
        }
        metronomeStatusDisplay.textContent = statusText;
    } else {
        metronomeStatusDisplay.textContent = '';
    }
}

// --- Main Scheduling Loop ---

function scheduler() {
    // Only schedule the active module
    if (activeMode === 'classic') {
        scheduleClassicMetronome();
    } else if (activeMode === 'clave') {
        scheduleClaveDesigner();
    }
    // No scheduling for 'list' mode yet, as it's not implemented
    
    updateMetronomeStatus(); // Update the UI status display
}

// --- Classic Metronome Scheduling Logic ---
function scheduleClassicMetronome() {
    // Calculate how many base notes (semínimas if denominator is 4) are in a whole note (16 semicolches)
    const baseNotesPerWholeNote = 16 / timeDenominator; // Example: 4/4 -> 16/4 = 4 base notes per whole note
    const secondsPerBaseNote = 60.0 / currentBPM; // Duration of one base note (e.g., one quarter note at 120BPM = 0.5s)
    
    // Duration of a single subdivision beat
    const secondsPerSubdivisionBeat = secondsPerBaseNote / subdivisionType;

    while (nextClassicClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume;
        let duration = 0.03; // Default duration for a subtle click

        // Determine if it's a downbeat, strong accent, or subdivision
        const isMainBeat = currentClassicSubdivision === 0;
        const isFirstBeatOfMeasure = currentClassicBeat === 0 && currentClassicSubdivision === 0;
        const isUserAccentedBeat = accentedBeats.has(currentClassicBeat) && isMainBeat; // NEW

        let isCompoundAccent = false;
        if (compoundSubdivisions.length > 0) {
            let beatCounter = 0;
            let currentCompoundGroupStartBeat = 0;
            for (let i = 0; i < compoundSubdivisions.length; i++) {
                if (currentClassicBeat === currentCompoundGroupStartBeat && i > 0 && isMainBeat) {
                    isCompoundAccent = true; // Mark as accent if it's the start of a new group (not the very first beat of measure)
                    break;
                }
                currentCompoundGroupStartBeat += compoundSubdivisions[i];
            }
        }

        if (isFirstBeatOfMeasure) {
            frequency = 1000; // Very high pitch for the absolute downbeat
            volume = 0.9;
            duration = 0.05;
        } else if (isCompoundAccent) {
            frequency = 880; // High pitch for compound accents
            volume = 0.8;
            duration = 0.04;
        } else if (isUserAccentedBeat) { // NEW: User-defined accents
            frequency = 800; // Slightly lower than compound accent, but still distinct
            volume = 0.75;
            duration = 0.04;
        } else if (isMainBeat) {
            frequency = 700; // Medium pitch for other main beats
            volume = 0.6;
        } else {
            frequency = 500; // Lower pitch for subdivisions
            volume = 0.4;
        }
        
        createClickSound(frequency, duration, volume, nextClassicClickTime);

        // Advance to the next subdivision beat
        nextClassicClickTime += secondsPerSubdivisionBeat;
        currentClassicSubdivision++;
        
        if (currentClassicSubdivision >= subdivisionType) {
            currentClassicSubdivision = 0;
            currentClassicBeat++;
            if (currentClassicBeat >= timeNumerator) {
                currentClassicBeat = 0; // Reset measure
            }
        }
    }
}

// --- Clave Designer Scheduling Logic ---
function scheduleClaveDesigner() {
    const secondsPerSemicolcheia = (60.0 / currentBPM) / 4; // One semicolcheia duration based on BPM (quarter note basis)

    while (nextClaveClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume = 0.0;
        let duration = 0.03;

        const claveValue = clavePattern[currentClaveIndex];

        // Remove active-beat class from the previously active point
        const prevActivePoint = claveGrid.querySelector('.clave-point.active-beat');
        if (prevActivePoint) {
            prevActivePoint.classList.remove('active-beat');
        }

        if (claveValue === CLAVE_BEAT_1) {
            frequency = 250; // Low pitch for Clave strong beat
            volume = 0.7;
            duration = 0.05;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 180; // Even lower pitch for Clave medium beat
            volume = 0.5;
        }
        
        // Only play sound if the current index is within the active cycle length
        if (currentClaveIndex < claveCycleLength && volume > 0.0) {
            createClickSound(frequency, duration, volume, nextClaveClickTime);
        }

        // Add active-beat class to the current point, only if it's part of the active loop
        if (currentClaveIndex < claveCycleLength) {
            const currentActivePoint = claveGrid.querySelector(`.clave-point[data-index="${currentClaveIndex}"]`);
            if (currentActivePoint) {
                currentActivePoint.classList.add('active-beat');
            }
        }

        // Advance to the next semicolcheia in the Clave pattern
        nextClaveClickTime += secondsPerSemicolcheia;
        currentClaveIndex++;
        
        // Loop back to start if we exceed the defined cycle length
        if (currentClaveIndex >= claveCycleLength) {
            currentClaveIndex = 0; // Loop back to start
        }
    }
}

// --- Global Metronome Controls (Play/Pause/Stop) ---

async function startMetronome() {
    if (isPlaying) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext initialized. State:', audioContext.state);
    }
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log('AudioContext resumed successfully.');
        } catch (e) {
            console.error('Error resuming AudioContext:', e);
            alert('Não foi possível iniciar o metrónomo. Por favor, interaja com a página (clique) e tente novamente.');
            return;
        }
    }

    isPlaying = true;
    playPauseBtn.textContent = '⏸️ Pausar';

    // Reset next click times and current indices for the active module
    if (activeMode === 'classic') {
        nextClassicClickTime = audioContext.currentTime;
        currentClassicBeat = 0;
        currentClassicSubdivision = 0;
    } else if (activeMode === 'clave') {
        nextClaveClickTime = audioContext.currentTime;
        currentClaveIndex = 0;
    }

    updateMetronomeStatus();

    intervalId = setInterval(scheduler, lookahead);
    console.log('Metronome started in mode:', activeMode);
}

function stopMetronome() {
    if (!isPlaying) return;

    isPlaying = false;
    clearInterval(intervalId); // Stop the scheduling loop

    playPauseBtn.textContent = '▶️ Iniciar';
    updateMetronomeStatus();

    // Remove active-beat indicator from Clave Designer grid
    const activePoint = claveGrid.querySelector('.clave-point.active-beat');
    if (activePoint) {
        activePoint.classList.remove('active-beat');
    }

    console.log('Metronome stopped.');
}

function toggleMetronome() {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
}

/**
 * Resets metronome state and restarts scheduling, useful after parameter changes.
 */
function resetAndSchedule() {
    if (isPlaying) {
        stopMetronome();
        startMetronome();
    }
}

// --- Mode Switching Logic ---
function switchMode(newMode) {
    if (activeMode === newMode) return; // Already in this mode

    stopMetronome(); // Stop any currently playing metronome

    // Hide all modules
    classicMetronomeModule.classList.remove('active-module');
    claveDesignerModule.classList.remove('active-module');
    listMetronomeModule.classList.remove('active-module');

    // Remove 'selected' class from all mode buttons
    modeClassicBtn.classList.remove('selected');
    modeClaveBtn.classList.remove('selected');
    modeListBtn.classList.remove('selected');

    // Show the new active module and mark its button as selected
    if (newMode === 'classic') {
        classicMetronomeModule.classList.add('active-module');
        modeClassicBtn.classList.add('selected');
    } else if (newMode === 'clave') {
        claveDesignerModule.classList.add('active-module');
        modeClaveBtn.classList.add('selected');
    } else if (newMode === 'list') {
        listMetronomeModule.classList.add('active-module');
        modeListBtn.classList.add('selected');
    }

    activeMode = newMode;
    console.log('Switched to mode:', activeMode);
    // No need to call resetAndSchedule() here, as startMetronome() will be called manually by user
}


// --- Event Listeners ---

// Global BPM Control
bpmSlider.addEventListener('input', updateBPMDisplay);

// Mode Selector Buttons
modeClassicBtn.addEventListener('click', () => switchMode('classic'));
modeClaveBtn.addEventListener('click', () => switchMode('clave'));
modeListBtn.addEventListener('click', () => switchMode('list'));

// Classic Metronome Controls
timeNumeratorInput.addEventListener('input', updateTimeSignature);
timeDenominatorSelect.addEventListener('change', updateTimeSignature);
compoundSubdivisionsInput.addEventListener('change', parseCompoundSubdivisions);
accentedBeatsInput.addEventListener('change', parseAccentedBeats); // NEW

subdivisionOffBtn.addEventListener('click', () => { subdivisionType = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivisionType = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivisionType = 3; updateSubdivisionButtons(); });
subdivision4Btn.addEventListener('click', () => { subdivisionType = 4; updateSubdivisionButtons(); });

// Clave Designer Controls
claveCycleLengthSlider.addEventListener('input', updateClaveCycleLength);

// Global Play/Stop
playPauseBtn.addEventListener('click', toggleMetronome);
stopBtn.addEventListener('click', stopMetronome);

// Keyboard Spacebar for Play/Pause
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return; // Don't trigger if typing in an input field
    }

    if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        toggleMetronome();
    }
});


// --- Initialization on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial display updates for BPM (now global)
    updateBPMDisplay();

    // Initial display updates for Classic Metronome
    updateTimeSignature();
    updateSubdivisionButtons();
    parseAccentedBeats(); // Initialize accented beats

    // Initial display updates for Clave Designer
    updateClaveCycleLength(); // This also calls renderClaveGrid()
    initializeClavePatternDefault(); // Set a default pattern for Clave Designer
    // renderClaveGrid() is called by updateClaveCycleLength()

    // Set initial active mode (Classic Metronome)
    switchMode('classic');
    updateMetronomeStatus();
});
