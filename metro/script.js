// --- Global Audio Context & Metronome State ---
let audioContext;
let isPlaying = false; // Overall playing state for the app
let lookahead = 25.0; // milliseconds: How often to call the scheduler (25ms)
let scheduleAheadTime = 0.1; // seconds: How far ahead to schedule audio (100ms)
let intervalId; // ID for the setInterval loop

// --- Module Toggles ---
let classicMetronomeEnabled = true;
let claveDesignerEnabled = true;

// --- Classic Metronome Module State ---
let currentBPM = 120;
let timeNumerator = 4; // Top number of time signature (e.g., 4 in 4/4)
let timeDenominator = 4; // Bottom number of time signature (e.g., 4 in 4/4)
let subdivisionType = 1; // 1 = none, 2 = 8th notes, 3 = 12th notes (triplets), 4 = 16th notes
let compoundSubdivisions = []; // e.g., [4, 3] for 7/4. Empty if simple time.

let nextClassicClickTime = 0.0;
let currentClassicBeat = 0; // Current beat within the measure (0-indexed)
let currentClassicSubdivision = 0; // Current subdivision within the beat (0-indexed)

// --- Clave Designer Module State ---
let syncClaveWithClassic = true; // New: Flag to sync Clave Designer with Classic Metronome's measure length
let totalSemicolchesPerMeasure = 16; // The length of one measure in semicolches from Classic Metronome

const CLAVE_OFF = 0;
const CLAVE_BEAT_1 = 1; // Strong click type for Clave Designer
const CLAVE_BEAT_2 = 2; // Medium click type for Clave Designer

let clavePattern = new Array(16).fill(CLAVE_OFF); // 16 semicolches grid
let nextClaveClickTime = 0.0;
let currentClaveIndex = 0; // Current index in the 16-semicolcheia pattern

// --- DOM Elements ---
const bpmSlider = document.getElementById('bpmSlider');
const bpmValueDisplay = document.getElementById('bpmValue');
const timeNumeratorInput = document.getElementById('timeNumerator');
const timeNumeratorValueDisplay = document.getElementById('timeNumeratorValue');
const timeDenominatorSelect = document.getElementById('timeDenominator');
const compoundSubdivisionsInput = document.getElementById('compoundSubdivisions');
const compoundTimeGroup = document.getElementById('compoundTimeGroup');

const subdivisionOffBtn = document.getElementById('subdivisionOffBtn');
const subdivision2Btn = document.getElementById('subdivision2Btn');
const subdivision3Btn = document.getElementById('subdivision3Btn');
const subdivision4Btn = document.getElementById('subdivision4Btn'); // New: 4x subdivision

const mainMetronomeToggle = document.getElementById('mainMetronomeToggle');
const claveDesignerToggle = document.getElementById('claveDesignerToggle');
const metronomeStatusDisplay = document.getElementById('metronomeStatus');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');

const claveGrid = document.getElementById('claveGrid');
const syncClaveWithClassicCheckbox = document.getElementById('syncClaveWithClassic');


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

// --- UI Update & Logic Functions (Classic Metronome) ---

function updateBPMDisplay() {
    currentBPM = parseInt(bpmSlider.value);
    bpmValueDisplay.textContent = currentBPM;
    resetAndSchedule();
}

function updateTimeSignature() {
    timeNumerator = parseInt(timeNumeratorInput.value);
    timeNumeratorValueDisplay.textContent = timeNumerator;
    timeDenominator = parseInt(timeDenominatorSelect.value);
    
    // Determine the type of beat (e.g., 4 for quarter note, 8 for eighth note)
    const beatsPerWholeNote = timeDenominator; // How many of the specified note value fit in a whole note
    // For example, if timeDenominator is 4 (quarter note), one beat is 1/4 of a whole note.
    // We need to calculate how many semicolches are in one *beat* of the time signature.
    // A semicolcheia is 1/16 of a whole note.
    // Semicolches per beat = (1 / timeDenominator) / (1 / 16) = 16 / timeDenominator
    // Example: 4/4 -> 16/4 = 4 semicolches per beat.
    // Example: 6/8 -> 16/8 = 2 semicolches per beat.

    // Calculate total semicolches in the measure for Clave Designer sync
    totalSemicolchesPerMeasure = timeNumerator * (16 / timeDenominator);

    // Show/hide compound time input based on numerator
    if (timeNumerator > 4 && timeNumerator !== 6 && timeNumerator !== 9 && timeNumerator !== 12) { // Typically irregular meters
        compoundTimeGroup.style.display = 'flex';
    } else {
        compoundTimeGroup.style.display = 'none';
        compoundSubdivisionsInput.value = ''; // Clear input
        compoundSubdivisions = []; // Clear array
    }

    resetAndSchedule();
    // Re-render clave grid to potentially adjust its visual length/markers
    renderClaveGrid();
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
        alert('Formato de compasso composto inválido. Use "4+3" e garanta que a soma é igual ao número de tempos.');
        compoundSubdivisionsInput.value = '';
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

// --- UI Update & Logic Functions (Global) ---

function updateModuleToggles() {
    mainMetronomeToggle.classList.toggle('selected', classicMetronomeEnabled);
    mainMetronomeToggle.textContent = classicMetronomeEnabled ? 'Metrónomo Clássico: ON ✅' : 'Metrónomo Clássico: OFF ❌';

    claveDesignerToggle.classList.toggle('selected', claveDesignerEnabled);
    claveDesignerToggle.textContent = claveDesignerEnabled ? 'Clave Designer: ON ✅' : 'Clave Designer: OFF ❌';

    resetAndSchedule();
}

function updateMetronomeStatus() {
    if (isPlaying) {
        let statusText = '';
        if (classicMetronomeEnabled) {
            statusText += `Clássico: ${currentClassicBeat + 1}/${timeNumerator}`;
            if (subdivisionType > 1) {
                statusText += `.${currentClassicSubdivision + 1}`;
            }
        }
        if (claveDesignerEnabled) {
            if (statusText) statusText += ' | ';
            statusText += `Clave: ${currentClaveIndex + 1}/${syncClaveWithClassic ? totalSemicolchesPerMeasure : 16}`;
        }
        metronomeStatusDisplay.textContent = statusText;
    } else {
        metronomeStatusDisplay.textContent = '';
    }
}

// --- Clave Designer Logic ---

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

        // Visually gray out points beyond the current measure length if synced
        if (syncClaveWithClassic && i >= totalSemicolchesPerMeasure) {
            point.style.opacity = '0.3';
            point.style.pointerEvents = 'none'; // Make them unclickable
        } else {
            point.style.opacity = '1';
            point.style.pointerEvents = 'auto';
        }

        // Toggle pattern value on click
        point.addEventListener('click', () => {
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
        });

        claveGrid.appendChild(point);
    }
}

// --- Main Scheduling Loop ---

function scheduler() {
    // Call individual module schedulers if enabled
    if (classicMetronomeEnabled) {
        scheduleClassicMetronome();
    }
    if (claveDesignerEnabled) {
        scheduleClaveDesigner();
    }
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

    const actualClaveLoopLength = syncClaveWithClassic ? totalSemicolchesPerMeasure : 16;

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
        
        if (volume > 0.0) { // Only play if a sound is defined
            createClickSound(frequency, duration, volume, nextClaveClickTime);
        }

        // Add active-beat class to the current point, only if it's part of the active loop
        if (currentClaveIndex < actualClaveLoopLength) {
            const currentActivePoint = claveGrid.querySelector(`.clave-point[data-index="${currentClaveIndex}"]`);
            if (currentActivePoint) {
                currentActivePoint.classList.add('active-beat');
            }
        }

        // Advance to the next semicolcheia in the Clave pattern
        nextClaveClickTime += secondsPerSemicolcheia;
        currentClaveIndex++;
        
        if (currentClaveIndex >= actualClaveLoopLength) {
            currentClaveIndex = 0; // Loop back to start
        }
    }
}

// --- Global Metronome Controls ---

async function startMetronome() {
    if (isPlaying) return;

    if (!classicMetronomeEnabled && !claveDesignerEnabled) {
        alert('Por favor, ative o Metrónomo Clássico ou o Clave Designer para iniciar.');
        return;
    }

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

    // Reset next click times and current indices for both modules
    nextClassicClickTime = audioContext.currentTime;
    currentClassicBeat = 0;
    currentClassicSubdivision = 0;

    nextClaveClickTime = audioContext.currentTime;
    currentClaveIndex = 0;

    updateMetronomeStatus();

    intervalId = setInterval(scheduler, lookahead);
    console.log('Metronome started.');
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

// --- Event Listeners ---

// Classic Metronome Controls
bpmSlider.addEventListener('input', updateBPMDisplay);
timeNumeratorInput.addEventListener('input', updateTimeSignature);
timeDenominatorSelect.addEventListener('change', updateTimeSignature);
compoundSubdivisionsInput.addEventListener('change', parseCompoundSubdivisions); // Use 'change' to parse when focus leaves

subdivisionOffBtn.addEventListener('click', () => { subdivisionType = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivisionType = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivisionType = 3; updateSubdivisionButtons(); });
subdivision4Btn.addEventListener('click', () => { subdivisionType = 4; updateSubdivisionButtons(); }); // New: 4x

// Module Toggles
mainMetronomeToggle.addEventListener('click', () => {
    classicMetronomeEnabled = !classicMetronomeEnabled;
    updateModuleToggles();
});
claveDesignerToggle.addEventListener('click', () => {
    claveDesignerEnabled = !claveDesignerEnabled;
    updateModuleToggles();
});

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

// Clave Designer Sync Toggle
syncClaveWithClassicCheckbox.addEventListener('change', () => {
    syncClaveWithClassic = syncClaveWithClassicCheckbox.checked;
    renderClaveGrid(); // Re-render grid to show/hide inactive points
    resetAndSchedule();
});


// --- Initialization on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial display updates
    updateBPMDisplay();
    updateTimeSignature(); // This also calculates totalSemicolchesPerMeasure
    updateSubdivisionButtons();
    updateModuleToggles();
    initializeClavePatternDefault(); // Set a default pattern for Clave Designer
    renderClaveGrid(); // Render the Clave Designer grid
    updateMetronomeStatus();
});
