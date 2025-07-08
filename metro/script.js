// --- Global Audio Context & Metronome State ---
let audioContext;
let isPlaying = false; // Overall playing state for the app
let lookahead = 25.0; // milliseconds: How often to call the scheduler (25ms)
let scheduleAheadTime = 0.1; // seconds: How far ahead to schedule audio (100ms)
let intervalId; // ID for the setInterval loop

let activeMode = 'classic'; // 'classic', 'clave', 'timeMap'

// --- GLOBAL BPM State ---
let currentBPM = 120; // BPM is now global

// --- Classic Metronome Module State ---
let timeNumerator = 4; // Top number of time signature (e.g., 4 in 4/4)
let timeDenominator = 4; // Bottom number of time signature (e.g., 4 in 4/4)
let subdivisionType = 1; // 1 = none, 2 = 8th notes, 3 = 12th notes (triplets), 4 = 16th notes
let accentedBeats = new Set(); // Set of beats to accent (e.g., {3, 5, 7})

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

// --- Time Map Module State ---
let timeMap = []; // Array to store time map sections
let currentMapSectionIndex = 0;
let measuresPlayedInCurrentSection = 0;
let nextMapMeasureTime = 0.0;
let isMapPlaying = false; // Flag to indicate if the map is currently playing

// --- DOM Elements ---
// Global BPM Control
const bpmSlider = document.getElementById('bpmSlider');
const bpmValueDisplay = document.getElementById('bpmValue');

// Mode Selector Buttons
const modeClassicBtn = document.getElementById('modeClassicBtn');
const modeClaveBtn = document.getElementById('modeClaveBtn');
const modeListBtn = document.getElementById('modeListBtn'); // Renamed from modeListBtn to reflect "Mapa de Tempo"

// Module Containers
const classicMetronomeModule = document.getElementById('classicMetronomeModule');
const claveDesignerModule = document.getElementById('claveDesignerModule');
const timeMapModule = document.getElementById('timeMapModule'); // Renamed from listMetronomeModule to timeMapModule

// Classic Metronome Controls
const timeNumeratorInput = document.getElementById('timeNumerator');
const timeNumeratorValueDisplay = document.getElementById('timeNumeratorValue');
const timeDenominatorSelect = document.getElementById('timeDenominator');
const accentedBeatsInput = document.getElementById('accentedBeats');

const subdivisionOffBtn = document.getElementById('subdivisionOffBtn');
const subdivision2Btn = document.getElementById('subdivision2Btn');
const subdivision3Btn = document.getElementById('subdivision3Btn');
const subdivision4Btn = document.getElementById('subdivision4Btn');

// Clave Designer Controls
const claveGrid = document.getElementById('claveGrid');
const claveCycleLengthSlider = document.getElementById('claveCycleLength');
const claveCycleLengthValueDisplay = document.getElementById('claveCycleLengthValue');

// Time Map Controls
const sectionTypeSelect = document.getElementById('sectionType');
const timeMapClassicControls = document.getElementById('timeMapClassicControls');
const sectionBPMInput = document.getElementById('sectionBPM');
const sectionNumeratorInput = document.getElementById('sectionNumerator');
const sectionDenominatorSelect = document.getElementById('sectionDenominator');
const sectionSubdivisionSelect = document.getElementById('sectionSubdivision');
const sectionAccentedBeatsInput = document.getElementById('sectionAccentedBeats');

const timeMapClaveControls = document.getElementById('timeMapClaveControls');
const sectionClaveBPMInput = document.getElementById('sectionClaveBPM');
const sectionClavePatternInput = document.getElementById('sectionClavePattern');
const sectionClaveLengthInput = document.getElementById('sectionClaveLength');

const timeMapPauseControls = document.getElementById('timeMapPauseControls');
const sectionPauseDurationInput = document.getElementById('sectionPauseDuration');

const sectionMeasuresInput = document.getElementById('sectionMeasures');
const addSectionBtn = document.getElementById('addSectionBtn');
const timeMapSectionsList = document.getElementById('timeMapSectionsList');

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
    // Only reset & schedule if not playing a time map
    if (!isMapPlaying) {
        resetAndSchedule();
    }
}

// --- UI Update & Logic Functions (Classic Metronome) ---

function updateTimeSignature() {
    timeNumerator = parseInt(timeNumeratorInput.value);
    timeNumeratorValueDisplay.textContent = timeNumerator;
    timeDenominator = parseInt(timeDenominatorSelect.value);
    
    if (!isMapPlaying) {
        resetAndSchedule();
    }
}

function parseAccentedBeats(inputString) {
    const beats = new Set();
    const parts = inputString.split(',').map(p => parseInt(p.trim()));
    for (const beat of parts) {
        if (!isNaN(beat) && beat >= 2) { // Beat must be >= 2 (as 1st beat is always strong)
            beats.add(beat - 1); // Store as 0-indexed
        }
    }
    return beats;
}

function updateAccentedBeats() {
    accentedBeats = parseAccentedBeats(accentedBeatsInput.value);
    if (!isMapPlaying) {
        resetAndSchedule();
    }
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

    if (!isMapPlaying) {
        resetAndSchedule();
    }
}

// --- UI Update & Logic Functions (Clave Designer) ---

function updateClaveCycleLength() {
    claveCycleLength = parseInt(claveCycleLengthSlider.value);
    claveCycleLengthValueDisplay.textContent = claveCycleLength;
    renderClaveGrid(); // Re-render to show active/inactive points
    if (!isMapPlaying) {
        resetAndSchedule();
    }
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
            // Only allow clicking on active points and if not playing map
            if (i < claveCycleLength && !isMapPlaying) {
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

// --- UI Update & Logic Functions (Time Map) ---

function showTimeMapSectionConfig() {
    const selectedType = sectionTypeSelect.value;
    timeMapClassicControls.classList.add('hidden');
    timeMapClaveControls.classList.add('hidden');
    timeMapPauseControls.classList.add('hidden');

    if (selectedType === 'classic') {
        timeMapClassicControls.classList.remove('hidden');
    } else if (selectedType === 'clave') {
        timeMapClaveControls.classList.remove('hidden');
    } else if (selectedType === 'pause') {
        timeMapPauseControls.classList.remove('hidden');
    }
}

function addSection() {
    const type = sectionTypeSelect.value;
    const measures = parseInt(sectionMeasuresInput.value);
    if (isNaN(measures) || measures <= 0) {
        alert("Por favor, insira uma duração válida para a secção (em compassos).");
        return;
    }

    let section = { type: type, measures: measures };

    if (type === 'classic') {
        section.bpm = parseInt(sectionBPMInput.value);
        section.numerator = parseInt(sectionNumeratorInput.value);
        section.denominator = parseInt(sectionDenominatorSelect.value);
        section.subdivision = parseInt(sectionSubdivisionSelect.value);
        section.accentedBeats = sectionAccentedBeatsInput.value; // Store as string, parse later
        if (isNaN(section.bpm) || isNaN(section.numerator) || isNaN(section.denominator) || isNaN(section.subdivision)) {
            alert("Por favor, preencha todos os campos do Metrónomo Clássico corretamente.");
            return;
        }
    } else if (type === 'clave') {
        section.bpm = parseInt(sectionClaveBPMInput.value);
        section.pattern = sectionClavePatternInput.value.split('').map(Number); // Convert string to array of numbers
        section.claveLength = parseInt(sectionClaveLengthInput.value);
        if (isNaN(section.bpm) || section.pattern.length !== 16 || section.pattern.some(isNaN) || isNaN(section.claveLength)) {
            alert("Por favor, preencha todos os campos do Clave Designer corretamente (padrão com 16 dígitos).");
            return;
        }
    } else if (type === 'pause') {
        section.duration = parseInt(sectionPauseDurationInput.value); // Duration in measures
        if (isNaN(section.duration) || section.duration <= 0) {
            alert("Por favor, insira uma duração válida para a pausa (em compassos).");
            return;
        }
    }

    timeMap.push(section);
    renderTimeMapList();
    console.log("Mapa de Tempo atualizado:", timeMap);
}

function removeSection(index) {
    if (confirm(`Tem a certeza que quer remover a secção ${index + 1}?`)) {
        timeMap.splice(index, 1);
        renderTimeMapList();
        // If the map is playing and we remove the current section, stop it.
        if (isMapPlaying && currentMapSectionIndex === index) {
            stopMetronome();
        } else if (isMapPlaying && currentMapSectionIndex > index) {
            // If section before current one is removed, adjust current index
            currentMapSectionIndex--;
        }
    }
}

function renderTimeMapList() {
    timeMapSectionsList.innerHTML = ''; // Clear existing list
    timeMap.forEach((section, index) => {
        const li = document.createElement('li');
        li.classList.add('time-map-section-item');
        if (isMapPlaying && index === currentMapSectionIndex) {
            li.classList.add('active');
        }

        let sectionInfoText = `Secção ${index + 1}: `;
        if (section.type === 'classic') {
            sectionInfoText += `Clássico - ${section.bpm} BPM, ${section.numerator}/${section.denominator}, Subdiv: ${section.subdivision}x`;
            if (section.accentedBeats) sectionInfoText += `, Acentos: ${section.accentedBeats}`;
        } else if (section.type === 'clave') {
            sectionInfoText += `Clave - ${section.bpm} BPM, Padrão: ${section.pattern.join('')}, Ciclo: ${section.claveLength} semi.`;
        } else if (section.type === 'pause') {
            sectionInfoText += `Pausa - ${section.duration} compassos`;
        }
        sectionInfoText += ` (${section.measures} compassos)`;

        li.innerHTML = `
            <span class="section-info">${sectionInfoText}</span>
            <div class="section-buttons">
                <button class="delete-btn" data-index="${index}">Remover</button>
            </div>
        `;
        timeMapSectionsList.appendChild(li);
    });

    // Add event listeners for delete buttons
    document.querySelectorAll('.time-map-section-item .delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            removeSection(indexToRemove);
        });
    });
}

// --- Global UI Update (Status Display) ---
function updateMetronomeStatus() {
    if (isPlaying) {
        if (activeMode === 'classic') {
            metronomeStatusDisplay.textContent = `Clássico: ${currentClassicBeat + 1}/${timeNumerator} BPM: ${currentBPM}`;
            if (subdivisionType > 1) {
                metronomeStatusDisplay.textContent += `.${currentClassicSubdivision + 1}`;
            }
        } else if (activeMode === 'clave') {
            metronomeStatusDisplay.textContent = `Clave: ${currentClaveIndex + 1}/${claveCycleLength} BPM: ${currentBPM}`;
        } else if (activeMode === 'timeMap') {
            const currentSection = timeMap[currentMapSectionIndex];
            if (currentSection) {
                let sectionInfo = `Mapa: Secção ${currentMapSectionIndex + 1}/${timeMap.length} (${measuresPlayedInCurrentSection + 1}/${currentSection.measures})`;
                if (currentSection.type === 'classic') {
                    sectionInfo += ` | Clássico: ${currentClassicBeat + 1}/${timeNumerator} BPM: ${currentBPM}`;
                    if (subdivisionType > 1) {
                        sectionInfo += `.${currentClassicSubdivision + 1}`;
                    }
                } else if (currentSection.type === 'clave') {
                    sectionInfo += ` | Clave: ${currentClaveIndex + 1}/${claveCycleLength} BPM: ${currentBPM}`;
                } else if (currentSection.type === 'pause') {
                    sectionInfo += ` | Pausa`;
                }
                metronomeStatusDisplay.textContent = sectionInfo;
            } else {
                metronomeStatusDisplay.textContent = 'Mapa de Tempo: Concluído.';
            }
        }
    } else {
        metronomeStatusDisplay.textContent = '';
    }
}

// --- Main Scheduling Loop ---

function scheduler() {
    if (activeMode === 'classic') {
        scheduleClassicMetronome();
    } else if (activeMode === 'clave') {
        scheduleClaveDesigner();
    } else if (activeMode === 'timeMap') {
        scheduleTimeMap();
    }
    
    updateMetronomeStatus();
}

// --- Classic Metronome Scheduling Logic ---
function scheduleClassicMetronome() {
    const secondsPerBaseNote = 60.0 / currentBPM;
    const secondsPerSubdivisionBeat = secondsPerBaseNote / subdivisionType;

    while (nextClassicClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume;
        let duration = 0.03;

        const isMainBeat = currentClassicSubdivision === 0;
        const isFirstBeatOfMeasure = currentClassicBeat === 0 && currentClassicSubdivision === 0;
        const isUserAccentedBeat = accentedBeats.has(currentClassicBeat) && isMainBeat;

        if (isFirstBeatOfMeasure) {
            frequency = 1000;
            volume = 0.9;
            duration = 0.05;
        } else if (isUserAccentedBeat) {
            frequency = 880;
            volume = 0.8;
            duration = 0.04;
        } else if (isMainBeat) {
            frequency = 700;
            volume = 0.6;
        } else {
            frequency = 500;
            volume = 0.4;
        }
        
        createClickSound(frequency, duration, volume, nextClassicClickTime);

        nextClassicClickTime += secondsPerSubdivisionBeat;
        currentClassicSubdivision++;
        
        if (currentClassicSubdivision >= subdivisionType) {
            currentClassicSubdivision = 0;
            currentClassicBeat++;
            if (currentClassicBeat >= timeNumerator) {
                currentClassicBeat = 0; // Reset measure
                // Notify time map that a measure has completed
                if (isMapPlaying) {
                    measuresPlayedInCurrentSection++;
                }
            }
        }
    }
}

// --- Clave Designer Scheduling Logic ---
function scheduleClaveDesigner() {
    const secondsPerSemicolcheia = (60.0 / currentBPM) / 4;

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
            frequency = 250;
            volume = 0.7;
            duration = 0.05;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 180;
            volume = 0.5;
        }
        
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

        nextClaveClickTime += secondsPerSemicolcheia;
        currentClaveIndex++;
        
        if (currentClaveIndex >= claveCycleLength) {
            currentClaveIndex = 0; // Loop back to start
            // If the clave module is being driven by the time map, signal a measure completion
            if (isMapPlaying) {
                // A 'measure' in clave mode is defined by the number of 'timeNumerator' beats * (16 / timeDenominator) semicolches.
                // However, for simplicity and integration with TimeMap's "measures",
                // we'll assume a "measure" in clave mode is effectively 16 semicolches (a 4/4 equivalent).
                // Or, more accurately, we need to know how many actual beats of the classic metronome correspond to a claveCycleLength.
                // This implies clave mode also needs a "time signature" or a way to define what a "measure" is.
                // For now, let's assume a "measure" in clave mode means the clave pattern has played N times
                // where N * claveCycleLength / 16 (semicolches in a 4/4) == 1 measure.
                // This is a simplification. A proper solution would be to define a time signature for Clave Designer too,
                // or define measure length in semicolches for the map.

                // For now, let's consider claveCycleLength as a "measure" completion for time map purposes if it completes a 'full' 16-semicolcheia cycle.
                // This needs more thought for truly flexible clave measures.
                // For now, let's make it simpler: a "measure" in clave is when 16 semicolches pass (equivalent to a 4/4 measure).
                // This means the clave pattern can be shorter, but the time map progresses by 4/4 measures.
                // If claveCycleLength is always less than 16, then a 'measure' for time map purposes is still based on 16 semicolches.
                // This implies that the actual 'measure' in clave mode is fixed at 16 semicolches for map progression.

                // Let's refine: For TimeMap, a 'measure' is defined as the time it takes for `timeNumerator` beats, where each beat
                // is `timeDenominator` in value. For Clave, there's no inherent time signature.
                // To make TimeMap consistent, we need to know how many semicolches are in a TimeMap "measure".
                // Let's assume a TimeMap "measure" is always equivalent to a 4/4 measure (16 semicolches).
                // So, if currentClaveIndex loops back and (currentClaveIndex % 16 == 0), then it's a measure.
                // This means 'measuresPlayedInCurrentSection' should increment every 16 semicolches for clave mode in time map.

                // This is a crucial point: How do we define "measures" for a Clave section in TimeMap?
                // The current setup assumes "measures" means `timeNumerator` beats where each beat is a `timeDenominator`.
                // Clave doesn't have `timeNumerator` or `timeDenominator`.
                // For the purpose of the Time Map, let's implicitly assume a "measure" is a 4/4 equivalent (16 semicolcheias).
                // So, a `claveCycleLength` will loop, and after 16 semicolcheias have passed, we increment `measuresPlayedInCurrentSection`.
                
                // Track accumulated semicolches for measure completion in Time Map
                // This requires a separate counter, or a re-evaluation of how 'measures' are tracked for clave.
                // For now, let's leave measuresPlayedInCurrentSection increment based on ClassicMetronome's currentClassicBeat advancing to 0.
                // This means the clave will play, but the Time Map will only advance its measure count based on a virtual 4/4 measure.

                // A better approach: The Time Map should define its measures based on *time duration* or a fixed 4/4.
                // Let's make it simple for now: `measuresPlayedInCurrentSection` is only incremented by `scheduleClassicMetronome`
                // and for `pause` sections, and for `clave` sections, it advances once every `16` semicolches.
                // This implies a measure in clave mode is 16 semicolches.

                // To fix this:
                // We need `secondsPerMeasure` for *each type of section* to track measures.
                // For Classic: `secondsPerMeasure = secondsPerBaseNote * timeNumerator`
                // For Clave: We need to define what a "measure" is. Let's make it fixed at a 4/4 (16 semicolches).
                // `secondsPerMeasure = secondsPerSemicolcheia * 16`
                // For Pause: `secondsPerMeasure` is essentially the pause duration itself.

                // This logic implies we need a 'nextMeasureTime' for the Time Map *independent* of the individual module scheduling.
                // Let's adapt scheduleTimeMap for this.
            }
        }
    }
}

// --- Time Map Scheduling Logic ---
function scheduleTimeMap() {
    if (timeMap.length === 0) {
        stopMetronome();
        metronomeStatusDisplay.textContent = 'Mapa de Tempo Vazio.';
        return;
    }

    // Initialize nextMapMeasureTime when starting a new map or resuming
    if (nextMapMeasureTime === 0.0) {
        nextMapMeasureTime = audioContext.currentTime;
    }

    while (nextMapMeasureTime < audioContext.currentTime + scheduleAheadTime) {
        const currentSection = timeMap[currentMapSectionIndex];
        if (!currentSection) {
            // Map finished
            stopMetronome();
            currentMapSectionIndex = 0; // Reset for next play
            measuresPlayedInCurrentSection = 0;
            nextMapMeasureTime = 0.0;
            renderTimeMapList(); // Update UI
            return;
        }

        // Apply settings of the current section
        applySectionSettings(currentSection);

        // Schedule one measure for the current section
        let secondsPerCurrentMeasure;

        if (currentSection.type === 'classic') {
            const sectionSecondsPerBaseNote = 60.0 / currentBPM; // Use global BPM
            secondsPerCurrentMeasure = sectionSecondsPerBaseNote * currentSection.numerator;
            // The classic metronome will handle its internal beats, we just drive it measure by measure
            scheduleClassicMetronomeLogicOnly(nextMapMeasureTime); // Schedule its beats within this measure
        } else if (currentSection.type === 'clave') {
            const sectionSecondsPerSemicolcheia = (60.0 / currentBPM) / 4; // Use global BPM
            // For clave, a "measure" in the map is defined as 16 semicolches for now for consistency
            secondsPerCurrentMeasure = sectionSecondsPerSemicolcheia * 16; 
            // The clave designer will handle its internal clicks based on the calculated currentBPM
            scheduleClaveDesignerLogicOnly(nextMapMeasureTime, secondsPerCurrentMeasure); // Schedule its clicks within this measure
        } else if (currentSection.type === 'pause') {
            // For pause, we need to know the duration of a standard 4/4 measure at the current BPM to scale the pause.
            // This is a design choice: should pause duration be fixed seconds, or tied to a conceptual measure length?
            // Let's tie it to a 4/4 measure equivalent at current BPM for musical context.
            const secondsPerQuarterNote = 60.0 / currentBPM;
            secondsPerCurrentMeasure = secondsPerQuarterNote * 4; // One 4/4 measure duration
            // No clicks for pause
        }

        // Advance the time for the next measure
        nextMapMeasureTime += secondsPerCurrentMeasure;
        measuresPlayedInCurrentSection++;

        // If the current section has played all its measures, move to the next section
        if (measuresPlayedInCurrentSection >= currentSection.measures) {
            currentMapSectionIndex++;
            measuresPlayedInCurrentSection = 0;
            // Reset internal beat counters for the next section type
            currentClassicBeat = 0;
            currentClassicSubdivision = 0;
            currentClaveIndex = 0;
            // Clear any active-beat highlights on clave grid
            const prevActivePoint = claveGrid.querySelector('.clave-point.active-beat');
            if (prevActivePoint) {
                prevActivePoint.classList.remove('active-beat');
            }
            renderTimeMapList(); // Update UI to highlight active section
        }
    }
}

// Helper function to apply section settings to global/module states
function applySectionSettings(section) {
    currentBPM = section.bpm || currentBPM; // Use section BPM or keep global
    bpmSlider.value = currentBPM;
    bpmValueDisplay.textContent = currentBPM;

    // Disable individual module controls when map is playing
    setModuleControlsEnabled(false);

    // Apply specific settings based on section type
    if (section.type === 'classic') {
        timeNumerator = section.numerator;
        timeDenominator = section.denominator;
        subdivisionType = section.subdivision;
        accentedBeats = parseAccentedBeats(section.accentedBeats);

        // Update UI displays for classic module
        timeNumeratorInput.value = timeNumerator;
        timeNumeratorValueDisplay.textContent = timeNumerator;
        timeDenominatorSelect.value = timeDenominator;
        
        // Update subdivision buttons visuals (no direct click, just visual update)
        subdivisionOffBtn.classList.remove('selected');
        subdivision2Btn.classList.remove('selected');
        subdivision3Btn.classList.remove('selected');
        subdivision4Btn.classList.remove('selected');
        if (subdivisionType === 1) subdivisionOffBtn.classList.add('selected');
        else if (subdivisionType === 2) subdivision2Btn.classList.add('selected');
        else if (subdivisionType === 3) subdivision3Btn.classList.add('selected');
        else if (subdivisionType === 4) subdivision4Btn.classList.add('selected');

        accentedBeatsInput.value = section.accentedBeats;

    } else if (section.type === 'clave') {
        clavePattern = section.pattern;
        claveCycleLength = section.claveLength;
        
        // Update UI displays for clave module
        claveCycleLengthSlider.value = claveCycleLength;
        claveCycleLengthValueDisplay.textContent = claveCycleLength;
        renderClaveGrid(); // Re-render grid to reflect new pattern/length
        
    } else if (section.type === 'pause') {
        // Pause has no sound settings, its duration is handled by the Time Map scheduler itself.
        // Ensure no clicks from other modules during pause.
        // This is implicitly handled by `scheduleTimeMap` not calling `createClickSound` for pause.
    }
}

// Simplified scheduling for individual modules when driven by TimeMap
// These functions don't manage `next...ClickTime` or `current...Beat/Index` or `measuresPlayedInCurrentSection`
// They just schedule clicks for *one measure* at a given `startTime`.
// Depois (corrigido):
// scheduleClassicMetronome - Pequena alteração para manter o currentClassicBeat como o TEMPO ATUAL
function scheduleClassicMetronome() {
    const secondsPerBaseNote = 60.0 / currentBPM;
    const secondsPerSubdivisionBeat = secondsPerBaseNote / subdivisionType;

    while (nextClassicClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume;
        let duration = 0.03;

        // currentClassicBeat e currentClassicSubdivision referem-se ao próximo clique
        const beatToPlay = currentClassicBeat;
        const subdivisionToPlay = currentClassicSubdivision;

        const isMainBeat = subdivisionToPlay === 0;
        const isFirstBeatOfMeasure = beatToPlay === 0 && subdivisionToPlay === 0;
        const isUserAccentedBeat = accentedBeats.has(beatToPlay) && isMainBeat;

        if (isFirstBeatOfMeasure) {
            frequency = 1000;
            volume = 0.9;
            duration = 0.05;
        } else if (isUserAccentedBeat) {
            frequency = 880;
            volume = 0.8;
            duration = 0.04;
        } else if (isMainBeat) {
            frequency = 700;
            volume = 0.6;
        } else {
            frequency = 500;
            volume = 0.4;
        }
        
        createClickSound(frequency, duration, volume, nextClassicClickTime);

        // AVANÇA OS CONTADORES APÓS AGENDAR O CLIQUE ATUAL
        nextClassicClickTime += secondsPerSubdivisionBeat;
        currentClassicSubdivision++;
        
        if (currentClassicSubdivision >= subdivisionType) {
            currentClassicSubdivision = 0;
            currentClassicBeat++;
            if (currentClassicBeat >= timeNumerator) {
                currentClassicBeat = 0; // Reset measure
                // Notify time map that a measure has completed (only in time map mode)
                if (isMapPlaying && activeMode === 'timeMap') { // Added check for activeMode === 'timeMap'
                    measuresPlayedInCurrentSection++;
                }
            }
        }
    }
}
function scheduleClaveDesignerLogicOnly(startTime, measureDuration) {
    const sectionSecondsPerSemicolcheia = (60.0 / currentBPM) / 4;
    const totalSemicolchesInMeasure = Math.round(measureDuration / sectionSecondsPerSemicolcheia); // Should be 16

    for (let i = 0; i < totalSemicolchesInMeasure; i++) {
        const patternIndex = i % claveCycleLength; // Loop through the clave pattern
        const claveValue = clavePattern[patternIndex];
        
        let frequency;
        let volume = 0.0;
        let duration = 0.03;

        if (claveValue === CLAVE_BEAT_1) {
            frequency = 250;
            volume = 0.7;
            duration = 0.05;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 180;
            volume = 0.5;
        }
        
        if (volume > 0.0) {
            createClickSound(frequency, duration, volume, startTime + (i * sectionSecondsPerSemicolcheia));
        }

        // Visual feedback for clave in map mode
        // This needs a separate loop to update in real-time, similar to classic.
        // For now, the `active-beat` is managed by `scheduleClaveDesigner` itself
        // but it will be overwritten by `scheduleTimeMap` in the current setup.
        // We might need to rethink `scheduleClaveDesigner` to be entirely driven by `nextClaveClickTime`
        // or have a visual-only loop for clave when map is active.
        // Let's keep `currentClaveIndex` and its visual update in the main `scheduler` loop for now.
        // This implies that `scheduleClaveDesignerLogicOnly` won't update `currentClaveIndex` visuals.
        // We need to manage `currentClaveIndex` from `scheduleTimeMap` if we want visual feedback during map playback.
        // For simplicity for this implementation, real-time visual beat highlighting for Classic/Clave *during Time Map playback*
        // will be limited to the status text.
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

    // Reset next click times and current indices based on active mode
    if (activeMode === 'classic') {
        nextClassicClickTime = audioContext.currentTime;
        currentClassicBeat = 0;
        currentClassicSubdivision = 0;
        isMapPlaying = false;
        setModuleControlsEnabled(true);
    } else if (activeMode === 'clave') {
        nextClaveClickTime = audioContext.currentTime;
        currentClaveIndex = 0;
        isMapPlaying = false;
        setModuleControlsEnabled(true);
    } else if (activeMode === 'timeMap') {
        if (timeMap.length === 0) {
            alert("O Mapa de Tempo está vazio! Adicione secções para começar.");
            isPlaying = false;
            playPauseBtn.textContent = '▶️ Iniciar';
            return;
        }
        currentMapSectionIndex = 0;
        measuresPlayedInCurrentSection = 0;
        nextMapMeasureTime = audioContext.currentTime; // Start scheduling from now
        isMapPlaying = true;
        setModuleControlsEnabled(false); // Disable controls when map is playing
        renderTimeMapList(); // Highlight the first section
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

    // Reset internal counters for individual modules
    currentClassicBeat = 0;
    currentClassicSubdivision = 0;
    currentClaveIndex = 0;

    // Reset time map counters
    currentMapSectionIndex = 0;
    measuresPlayedInCurrentSection = 0;
    nextMapMeasureTime = 0.0;
    isMapPlaying = false;

    // Remove active-beat indicator from Clave Designer grid
    const activePoint = claveGrid.querySelector('.clave-point.active-beat');
    if (activePoint) {
        activePoint.classList.remove('active-beat');
    }
    renderTimeMapList(); // Clear active section highlight

    // Re-enable individual module controls
    setModuleControlsEnabled(true);

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
 * Only applies if not in Time Map mode.
 */
function resetAndSchedule() {
    if (!isMapPlaying) {
        if (isPlaying) {
            stopMetronome();
            startMetronome();
        }
    }
}

// Function to enable/disable module controls
function setModuleControlsEnabled(enabled) {
    const controlsToDisable = [
        bpmSlider, timeNumeratorInput, timeDenominatorSelect, accentedBeatsInput,
        subdivisionOffBtn, subdivision2Btn, subdivision3Btn, subdivision4Btn,
        claveCycleLengthSlider,
        // Also disable add section controls for Time Map when it's playing
        sectionTypeSelect, sectionBPMInput, sectionNumeratorInput, sectionDenominatorSelect,
        sectionSubdivisionSelect, sectionAccentedBeatsInput, sectionClaveBPMInput,
        sectionClavePatternInput, sectionClaveLengthInput, sectionPauseDurationInput,
        sectionMeasuresInput, addSectionBtn
    ];

    controlsToDisable.forEach(control => {
        if (control) control.disabled = !enabled;
    });

    // Handle subdivision buttons separately as they have 'selected' class
    [subdivisionOffBtn, subdivision2Btn, subdivision3Btn, subdivision4Btn].forEach(btn => {
        btn.disabled = !enabled;
    });

    // Disable delete buttons in Time Map list if map is playing
    document.querySelectorAll('.time-map-section-item .delete-btn').forEach(button => {
        button.disabled = !enabled;
    });
}


// --- Mode Switching Logic ---
function switchMode(newMode) {
    if (activeMode === newMode) return; // Already in this mode

    stopMetronome(); // Stop any currently playing metronome

    // Hide all modules
    classicMetronomeModule.classList.remove('active-module');
    claveDesignerModule.classList.remove('active-module');
    timeMapModule.classList.remove('active-module');

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
    } else if (newMode === 'timeMap') {
        timeMapModule.classList.add('active-module');
        modeListBtn.classList.add('selected');
    }

    activeMode = newMode;
    console.log('Switched to mode:', activeMode);
    // When switching modes, re-enable controls
    setModuleControlsEnabled(true);
}


// --- Event Listeners ---

// Global BPM Control
bpmSlider.addEventListener('input', updateBPMDisplay);

// Mode Selector Buttons
modeClassicBtn.addEventListener('click', () => switchMode('classic'));
modeClaveBtn.addEventListener('click', () => switchMode('clave'));
modeListBtn.addEventListener('click', () => switchMode('timeMap')); // Changed to timeMap

// Classic Metronome Controls
timeNumeratorInput.addEventListener('input', updateTimeSignature);
timeDenominatorSelect.addEventListener('change', updateTimeSignature);
accentedBeatsInput.addEventListener('change', updateAccentedBeats);

subdivisionOffBtn.addEventListener('click', () => { subdivisionType = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivisionType = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivisionType = 3; updateSubdivisionButtons(); });
subdivision4Btn.addEventListener('click', () => { subdivisionType = 4; updateSubdivisionButtons(); });

// Clave Designer Controls
claveCycleLengthSlider.addEventListener('input', updateClaveCycleLength);

// Time Map Controls
sectionTypeSelect.addEventListener('change', showTimeMapSectionConfig);
addSectionBtn.addEventListener('click', addSection);

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
    updateAccentedBeats(); // Initialize accented beats

    // Initial display updates for Clave Designer
    updateClaveCycleLength(); // This also calls renderClaveGrid()
    initializeClavePatternDefault(); // Set a default pattern for Clave Designer

    // Initial display updates for Time Map
    showTimeMapSectionConfig(); // Show correct config panel for default type
    renderTimeMapList(); // Render empty list initially

    // Set initial active mode (Classic Metronome)
    switchMode('classic');
    updateMetronomeStatus();
});

// Helper functions for scheduling logic for Time Map
// These are simplified versions of the main schedule functions,
// only responsible for *generating clicks for one measure* at a given time.
// They do NOT manage internal beat counters or advance 'nextClickTime'.
function scheduleClassicMetronomeLogicOnly(measureStartTime) {
    const sectionBPM = currentBPM; // Use the global BPM set by applySectionSettings
    const sectionNumerator = timeNumerator;
    const sectionDenominator = timeDenominator;
    const sectionSubdivisionType = subdivisionType;
    const sectionAccentedBeats = accentedBeats;

    const secondsPerBaseNote = 60.0 / sectionBPM;
    // This is the correct variable name, defined locally in this function
    const secondsPerSubdivisionBeat = secondsPerBaseNote / sectionSubdivisionType; 

    for (let beat = 0; beat < sectionNumerator; beat++) {
        for (let subd = 0; subd < sectionSubdivisionType; subd++) {
            // FIX IS HERE: Changed 'sectionSecondsPerSubdivisionBeat' to 'secondsPerSubdivisionBeat'
            let clickTime = measureStartTime + (beat * secondsPerBaseNote) + (subd * secondsPerSubdivisionBeat); 
            
            let frequency;
            let volume;
            let duration = 0.03;

            const isMainBeat = subd === 0;
            const isFirstBeatOfMeasure = beat === 0 && subd === 0;
            const isUserAccentedBeat = sectionAccentedBeats.has(beat) && isMainBeat;

            if (isFirstBeatOfMeasure) {
                frequency = 1000;
                volume = 0.9;
                duration = 0.05;
            } else if (isUserAccentedBeat) {
                frequency = 880;
                volume = 0.8;
                duration = 0.04;
            } else if (isMainBeat) {
                frequency = 700;
                volume = 0.6;
            } else {
                frequency = 500;
                volume = 0.4;
            }
            createClickSound(frequency, duration, volume, clickTime);
        }
    }
}

function scheduleClaveDesignerLogicOnly(measureStartTime, measureDuration) {
    const sectionBPM = currentBPM; // Use global BPM
    const sectionClavePattern = clavePattern;
    const sectionClaveLength = claveCycleLength;

    const secondsPerSemicolcheia = (60.0 / sectionBPM) / 4;
    const totalSemicolchesInMeasure = Math.round(measureDuration / secondsPerSemicolcheia); // Should be 16

    for (let i = 0; i < totalSemicolchesInMeasure; i++) {
        const patternIndex = i % sectionClaveLength;
        const claveValue = sectionClavePattern[patternIndex];
        
        let frequency;
        let volume = 0.0;
        let duration = 0.03;

        if (claveValue === CLAVE_BEAT_1) {
            frequency = 250;
            volume = 0.7;
            duration = 0.05;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 180;
            volume = 0.5;
        }
        
        if (volume > 0.0) {
            createClickSound(frequency, duration, volume, measureStartTime + (i * secondsPerSemicolcheia));
        }
    }
}
