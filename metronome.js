// --- Variáveis Globais do Metrónomo ---
let audioContext;

// Estado geral
let isPlaying = false; // Indica se qualquer um dos metrónomos está a tocar
let lookahead = 25.0; // mseg: Quanto tempo para olhar à frente no agendamento
let scheduleAheadTime = 0.1; // Segundos: Quantos segundos para agendar no futuro
let intervalId; // ID do setInterval para o loop de agendamento principal

// --- Metrónomo Principal (Tradicional) ---
let mainMetronomeEnabled = true; // Permite ligar/desligar o metrónomo principal
let currentBPM = 120;
let beatsPerMeasure = 4; // Tempos por compasso (ex: 4 para 4/4)
let subdivision = 1; // 1 = sem subdivisão, 2 = 8as, 3 = 12as

let nextMainClickTime = 0.0; // Próximo tempo de agendamento para o metrónomo principal
let currentMainBeat = 0; // Batida atual no compasso (0-indexado)
let currentMainSubdivision = 0; // Subdivisão atual dentro da batida (0-indexado)

// --- Clave Designer ---
let claveDesignerEnabled = true; // Permite ligar/desligar o clave designer

let nextClaveClickTime = 0.0; // Próximo tempo de agendamento para o Clave Designer
let currentClaveIndex = 0; // Índice atual no clavePattern (0 a 15)

// Array para o Clave Designer: 16 elementos representando semicolcheias
// 0: Off, 1: Beat 1 (Forte), 2: Beat 2 (Médio)
const CLAVE_OFF = 0;
const CLAVE_BEAT_1 = 1; // Som forte para a clave
const CLAVE_BEAT_2 = 2; // Som médio para a clave

let clavePattern = []; // Inicializado em initializeClavePattern


// --- Elementos do DOM ---
const bpmSlider = document.getElementById('bpmSlider');
const bpmValueDisplay = document.getElementById('bpmValue');
const beatsPerMeasureSlider = document.getElementById('beatsPerMeasureSlider');
const beatsPerMeasureValueDisplay = document.getElementById('beatsPerMeasureValue');

const subdivisionOffBtn = document.getElementById('subdivisionOffBtn');
const subdivision2Btn = document.getElementById('subdivision2Btn');
const subdivision3Btn = document.getElementById('subdivision3Btn');

const mainMetronomeToggle = document.getElementById('mainMetronomeToggle'); // NOVO: Toggle para o Metrónomo Principal
const claveDesignerToggle = document.getElementById('claveDesignerToggle'); // NOVO: Toggle para o Clave Designer

const metronomeStatusDisplay = document.getElementById('metronomeStatus');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const claveGrid = document.getElementById('claveGrid');


// --- Funções de Criação de Som (Web Audio API) ---

// Gera um som de clique simples usando um OscillatorNode
function createClickSound(frequency, duration, volume, startTime) {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
    };
}

// --- Funções de Atualização da UI ---

function updateBPMDisplay() {
    currentBPM = parseInt(bpmSlider.value);
    bpmValueDisplay.textContent = currentBPM;
    if (isPlaying) { // Se estiver a tocar, reinicia o agendamento
        resetAndSchedule();
    }
}

function updateBeatsPerMeasureDisplay() {
    beatsPerMeasure = parseInt(beatsPerMeasureSlider.value);
    beatsPerMeasureValueDisplay.textContent = beatsPerMeasure;
    // Quando os tempos por compasso mudam, o padrão do clave designer pode precisar ser re-inicializado
    initializeClavePattern();
    renderClaveGrid(); // Re-renderiza a grelha
    if (isPlaying) { // Se estiver a tocar, reinicia o agendamento
        resetAndSchedule();
    }
}

function updateSubdivisionButtons() {
    subdivisionOffBtn.classList.remove('selected');
    subdivision2Btn.classList.remove('selected');
    subdivision3Btn.classList.remove('selected');

    if (subdivision === 1) subdivisionOffBtn.classList.add('selected');
    else if (subdivision === 2) subdivision2Btn.classList.add('selected');
    else if (subdivision === 3) subdivision3Btn.classList.add('selected');

    if (isPlaying && mainMetronomeEnabled) {
        resetAndSchedule();
    }
}

function updateMetronomeToggles() {
    mainMetronomeToggle.textContent = mainMetronomeEnabled ? 'Metrónomo: ON ✅' : 'Metrónomo: OFF ❌';
    mainMetronomeToggle.style.background = mainMetronomeEnabled ? 'linear-gradient(45deg, #1abc9c, #16a085)' : 'linear-gradient(45deg, #6c757d, #5a6268)';

    claveDesignerToggle.textContent = claveDesignerEnabled ? 'Clave Designer: ON ✅' : 'Clave Designer: OFF ❌';
    claveDesignerToggle.style.background = claveDesignerEnabled ? 'linear-gradient(45deg, #1abc9c, #16a085)' : 'linear-gradient(45deg, #6c757d, #5a6268)';

    // Se estiver a tocar, reinicia o agendamento para refletir as mudanças
    if (isPlaying) {
        resetAndSchedule();
    }
}

function updateMetronomeStatus() {
    if (isPlaying) {
        // Exibição mais complexa para mostrar ambas as camadas
        let statusText = '';
        if (mainMetronomeEnabled) {
            statusText += `M: ${currentMainBeat + 1}/${beatsPerMeasure}`;
            if (subdivision > 1) {
                statusText += `.${currentMainSubdivision + 1}`;
            }
        }
        if (claveDesignerEnabled) {
            if (statusText) statusText += ' | ';
            statusText += `C: ${currentClaveIndex + 1}/16`;
        }
        metronomeStatusDisplay.textContent = statusText;
    } else {
        metronomeStatusDisplay.textContent = '';
    }
}

// --- Clave Designer ---

// Inicializa o padrão da clave com as batidas principais
function initializeClavePattern() {
    clavePattern = new Array(16).fill(CLAVE_OFF); // Começa com tudo off
    const semicolchesPerBeat = 16 / beatsPerMeasure;

    for (let i = 0; i < beatsPerMeasure; i++) {
        const startIndex = Math.floor(i * semicolchesPerBeat);
        if (i === 0) {
            clavePattern[startIndex] = CLAVE_BEAT_1;
        } else {
            clavePattern[startIndex] = CLAVE_BEAT_2;
        }
    }
}

function renderClaveGrid() {
    claveGrid.innerHTML = '';

    for (let i = 0; i < 16; i++) {
        const point = document.createElement('div');
        point.classList.add('clave-point');
        point.dataset.index = i;

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


// --- Funções de Agendamento ---

// Agendador principal que chama os agendadores das duas camadas
function scheduler() {
    if (mainMetronomeEnabled) {
        scheduleMainMetronome();
    }
    if (claveDesignerEnabled) {
        scheduleClaveDesigner();
    }
    updateMetronomeStatus(); // Atualiza o status visual
}

// Agendador para o Metrónomo Principal
function scheduleMainMetronome() {
    // Calcula a duração de uma subdivisão na batida principal
    const secondsPerBeat = 60.0 / currentBPM;
    const secondsPerSubdivision = secondsPerBeat / subdivision;

    while (nextMainClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume;
        let duration = 0.03; // Duração do clique

        if (currentMainSubdivision === 0) { // Batida principal ou primeira subdivisão
            if (currentMainBeat === 0) { // Primeira batida do compasso
                frequency = 1000; // Som mais agudo e forte
                volume = 0.9;
                duration = 0.05;
            } else { // Outras batidas principais
                frequency = 800; // Som médio
                volume = 0.7;
            }
        } else { // Subdivisões
            frequency = 600; // Som mais suave
            volume = 0.5;
        }

        createClickSound(frequency, duration, volume, nextMainClickTime);

        // Avança para a próxima subdivisão
        nextMainClickTime += secondsPerSubdivision;
        currentMainSubdivision++;
        if (currentMainSubdivision >= subdivision) {
            currentMainSubdivision = 0;
            currentMainBeat++;
            if (currentMainBeat >= beatsPerMeasure) {
                currentMainBeat = 0; // Reinicia o compasso
            }
        }
    }
}

// Agendador para o Clave Designer
function scheduleClaveDesigner() {
    // Calcula a duração de cada semicolcheia (1/4 de semínima)
    const secondsPerSeminima = 60.0 / currentBPM; // Duração de uma semínima
    const secondsPerSemicolcheia = secondsPerSeminima / 4; // Duração de uma semicolcheia

    while (nextClaveClickTime < audioContext.currentTime + scheduleAheadTime) {
        let frequency;
        let volume = 0.0; // Assume volume 0, só ativa se houver som
        let duration = 0.03;

        const claveValue = clavePattern[currentClaveIndex];

        // Remove o indicador visual da batida anterior
        const prevActivePoint = claveGrid.querySelector('.clave-point.active-beat');
        if (prevActivePoint) {
            prevActivePoint.classList.remove('active-beat');
        }

        if (claveValue === CLAVE_BEAT_1) {
            frequency = 300; // Som grave e forte para a clave
            volume = 0.7;
            duration = 0.05;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 200; // Som grave e médio para a clave
            volume = 0.5;
        }

        if (volume > 0.0) { // Só toca se houver som definido no padrão
            createClickSound(frequency, duration, volume, nextClaveClickTime);
        }

        // Adiciona o indicador visual à batida atual do clave designer
        const currentActivePoint = claveGrid.querySelector(`.clave-point[data-index="${currentClaveIndex}"]`);
        if (currentActivePoint) {
            currentActivePoint.classList.add('active-beat');
        }

        // Avança para a próxima semicolcheia no padrão do clave designer
        nextClaveClickTime += secondsPerSemicolcheia;
        currentClaveIndex++;
        if (currentClaveIndex >= 16) {
            currentClaveIndex = 0; // Reinicia o padrão
        }
    }
}


// --- Funções de Controlo Principal do Metrónomo ---

async function startMetronome() {
    if (isPlaying) return;

    if (!mainMetronomeEnabled && !claveDesignerEnabled) {
        alert('Por favor, ative o Metrónomo Principal ou o Clave Designer para iniciar.');
        return;
    }

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext Metrónomo inicializado. Estado:', audioContext.state);
    }
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log('AudioContext Metrónomo retomado com sucesso.');
        } catch (e) {
            console.error('Erro ao retomar AudioContext do Metrónomo:', e);
            alert('Não foi possível iniciar o metrónomo. Por favor, interaja com a página (clique) e tente novamente.');
            return;
        }
    }

    isPlaying = true;
    playPauseBtn.textContent = '⏸️ Pausar';

    // Reinicia os tempos e índices de ambas as camadas
    nextMainClickTime = audioContext.currentTime;
    currentMainBeat = 0;
    currentMainSubdivision = 0;

    nextClaveClickTime = audioContext.currentTime;
    currentClaveIndex = 0;

    updateMetronomeStatus();

    // Inicia o loop de agendamento principal
    intervalId = setInterval(scheduler, lookahead);
    console.log('Metrónomo iniciado.');
}

function stopMetronome() {
    if (!isPlaying) return;

    isPlaying = false;
    clearInterval(intervalId); // Para o loop de agendamento

    playPauseBtn.textContent = '▶️ Iniciar';
    updateMetronomeStatus();

    // Remove indicadores visuais
    const activePoint = claveGrid.querySelector('.clave-point.active-beat');
    if (activePoint) {
        activePoint.classList.remove('active-beat');
    }

    console.log('Metrónomo parado.');
}

function toggleMetronome() {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
}

// Reinicia o agendamento (chamado após mudanças em BPM, compasso, etc.)
function resetAndSchedule() {
    if (isPlaying) {
        stopMetronome(); // Para o agendador atual
        startMetronome(); // Inicia um novo agendador com os novos parâmetros
    }
}

// --- Event Listeners ---

bpmSlider.addEventListener('input', updateBPMDisplay);
beatsPerMeasureSlider.addEventListener('input', updateBeatsPerMeasureDisplay);

subdivisionOffBtn.addEventListener('click', () => { subdivision = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivision = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivision = 3; updateSubdivisionButtons(); });

mainMetronomeToggle.addEventListener('click', () => {
    mainMetronomeEnabled = !mainMetronomeEnabled;
    updateMetronomeToggles();
});

claveDesignerToggle.addEventListener('click', () => {
    claveDesignerEnabled = !claveDesignerEnabled;
    updateMetronomeToggles();
});

playPauseBtn.addEventListener('click', toggleMetronome);
stopBtn.addEventListener('click', stopMetronome);


// NOVO: Event Listener para a tecla Espaço
document.addEventListener('keydown', (e) => {
    // Ignora eventos de teclado se o utilizador estiver a escrever num input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault(); // Evita que a barra de espaço role a página
        toggleMetronome();
    }
});


// --- Inicialização ao Carregar a Página ---
document.addEventListener('DOMContentLoaded', () => {
    // Adiciona os novos toggles ao HTML se não existirem
    const metronomeControlsDiv = document.querySelector('.metronome-controls');
    if (!document.getElementById('mainMetronomeToggle')) {
        const mainToggle = document.createElement('button');
        mainToggle.id = 'mainMetronomeToggle';
        mainToggle.textContent = 'Metrónomo: ON ✅';
        mainToggle.className = 'toggle-btn'; // Adiciona uma classe para styling futuro se quiseres
        mainToggle.addEventListener('click', () => {
            mainMetronomeEnabled = !mainMetronomeEnabled;
            updateMetronomeToggles();
        });
        metronomeControlsDiv.insertBefore(mainToggle, playPauseBtn);
        mainMetronomeToggle = mainToggle; // Atualiza a referência DOM global
    }
    if (!document.getElementById('claveDesignerToggle')) {
        const claveToggle = document.createElement('button');
        claveToggle.id = 'claveDesignerToggle';
        claveToggle.textContent = 'Clave Designer: ON ✅';
        claveToggle.className = 'toggle-btn';
        claveToggle.addEventListener('click', () => {
            claveDesignerEnabled = !claveDesignerEnabled;
            updateMetronomeToggles();
        });
        metronomeControlsDiv.insertBefore(claveToggle, playPauseBtn);
        claveDesignerToggle = claveToggle; // Atualiza a referência DOM global
    }

    // Inicializa o estado visual dos controlos
    updateBPMDisplay();
    updateBeatsPerMeasureDisplay(); // Isto chama initializeClavePattern() e renderClaveGrid()
    updateSubdivisionButtons();
    updateMetronomeToggles(); // Garante que os toggles estão corretos no início
    updateMetronomeStatus();
});
