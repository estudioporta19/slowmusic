// --- Variáveis Globais do Metrónomo ---
let audioContext;
let isPlaying = false;
let currentBPM = 120;
let beatsPerMeasure = 4; // Tempos por compasso (ex: 4 para 4/4)
let subdivision = 1; // 1 = sem subdivisão, 2 = 8as, 3 = 12as

let nextClickTime = 0.0; // Próximo tempo de agendamento em segundos do AudioContext
let currentBeat = 0; // Batida atual (0-indexado)
let currentSubdivision = 0; // Subdivisão atual dentro da batida (0-indexado)
let scheduleAheadTime = 0.1; // Quantos segundos para agendar no futuro
let lookahead = 25.0; // mseg: Quanto tempo para olhar à frente
let intervalId; // ID do setInterval para o agendamento

// Array para o Clave Designer: 16 elementos representando semicolcheias
// 0: Off, 1: Beat 1 (Forte), 2: Beat 2 (Médio)
// Padrão padrão: 1 (forte), 2 (médio), 2 (médio), 2 (médio), depois repete
// 16 semicolcheias num compasso de 4/4 (4 semicolcheias por batida)
const CLAVE_OFF = 0;
const CLAVE_BEAT_1 = 1;
const CLAVE_BEAT_2 = 2; // Para outras batidas ou subdivisões

let clavePattern = [
    CLAVE_BEAT_1, CLAVE_OFF, CLAVE_OFF, CLAVE_OFF, // Beat 1
    CLAVE_BEAT_2, CLAVE_OFF, CLAVE_OFF, CLAVE_OFF, // Beat 2
    CLAVE_BEAT_2, CLAVE_OFF, CLAVE_OFF, CLAVE_OFF, // Beat 3
    CLAVE_BEAT_2, CLAVE_OFF, CLAVE_OFF, CLAVE_OFF  // Beat 4
];
// Ajusta o padrão padrão para ser flexível com beatsPerMeasure
function initializeClavePattern() {
    clavePattern = new Array(16).fill(CLAVE_OFF); // Começa com tudo off
    const semicolchesPerBeat = 16 / beatsPerMeasure; // Ex: 16/4 = 4 semicolches por batida

    for (let i = 0; i < beatsPerMeasure; i++) {
        const startIndex = i * semicolchesPerBeat;
        if (i === 0) {
            clavePattern[startIndex] = CLAVE_BEAT_1; // Primeira batida do compasso (mais forte)
        } else {
            clavePattern[startIndex] = CLAVE_BEAT_2; // Outras batidas (média)
        }
    }
}
initializeClavePattern(); // Chamada inicial

// --- Elementos do DOM ---
const bpmSlider = document.getElementById('bpmSlider');
const bpmValueDisplay = document.getElementById('bpmValue');
const beatsPerMeasureSlider = document.getElementById('beatsPerMeasureSlider');
const beatsPerMeasureValueDisplay = document.getElementById('beatsPerMeasureValue');
const subdivisionOffBtn = document.getElementById('subdivisionOffBtn');
const subdivision2Btn = document.getElementById('subdivision2Btn');
const subdivision3Btn = document.getElementById('subdivision3Btn');
const metronomeStatusDisplay = document.getElementById('metronomeStatus');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const claveGrid = document.getElementById('claveGrid');


// --- Funções de Criação de Som (Web Audio API) ---

// Gera um som de clique simples usando um OscillatorNode
function createClickSound(frequency, duration, volume) {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine'; // Ou 'square', 'triangle', 'sawtooth'
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    // Envelope de ataque/decay para um som de clique
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);

    // Limpeza para evitar acumulação de nós
    oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
    };
}

// --- Funções de Atualização da UI ---

function updateBPMDisplay() {
    currentBPM = parseInt(bpmSlider.value);
    bpmValueDisplay.textContent = currentBPM;
}

function updateBeatsPerMeasureDisplay() {
    beatsPerMeasure = parseInt(beatsPerMeasureSlider.value);
    beatsPerMeasureValueDisplay.textContent = beatsPerMeasure;
    // Quando os tempos por compasso mudam, o padrão do clave designer pode precisar ser re-inicializado
    initializeClavePattern();
    renderClaveGrid(); // Re-renderiza a grelha
}

function updateSubdivisionButtons() {
    subdivisionOffBtn.classList.remove('selected');
    subdivision2Btn.classList.remove('selected');
    subdivision3Btn.classList.remove('selected');

    if (subdivision === 1) subdivisionOffBtn.classList.add('selected');
    else if (subdivision === 2) subdivision2Btn.classList.add('selected');
    else if (subdivision === 3) subdivision3Btn.classList.add('selected');
}

function updateMetronomeStatus() {
    if (isPlaying) {
        metronomeStatusDisplay.textContent = `Batida: ${currentBeat + 1}/${beatsPerMeasure}`;
    } else {
        metronomeStatusDisplay.textContent = '';
    }
}

// --- Clave Designer ---

function renderClaveGrid() {
    claveGrid.innerHTML = ''; // Limpa a grelha existente

    for (let i = 0; i < 16; i++) {
        const point = document.createElement('div');
        point.classList.add('clave-point');
        point.dataset.index = i; // Armazena o índice para referência

        // Define a classe visual com base no padrão inicial
        if (clavePattern[i] === CLAVE_BEAT_1) {
            point.classList.add('beat-1');
            point.textContent = '1'; // Visualmente indica a batida 1
        } else if (clavePattern[i] === CLAVE_BEAT_2) {
            point.classList.add('beat-2');
            point.textContent = '•'; // Visualmente indica outras batidas
        } else {
            point.classList.add('beat-0');
        }

        // Lógica para alternar o estado do ponto ao clicar
        point.addEventListener('click', () => {
            if (clavePattern[i] === CLAVE_OFF) {
                clavePattern[i] = CLAVE_BEAT_1; // Off -> Forte
                point.classList.remove('beat-0');
                point.classList.add('beat-1');
                point.textContent = '1';
            } else if (clavePattern[i] === CLAVE_BEAT_1) {
                clavePattern[i] = CLAVE_BEAT_2; // Forte -> Médio
                point.classList.remove('beat-1');
                point.classList.add('beat-2');
                point.textContent = '•';
            } else {
                clavePattern[i] = CLAVE_OFF; // Médio -> Off
                point.classList.remove('beat-2');
                point.classList.add('beat-0');
                point.textContent = '';
            }
        });

        claveGrid.appendChild(point);
    }
}


// --- Funções de Controlo do Metrónomo ---

// Função principal de agendamento do metrónomo
function scheduler() {
    // Enquanto houver eventos para agendar (no futuro próximo)
    while (nextClickTime < audioContext.currentTime + scheduleAheadTime) {
        // Reproduz o som da batida atual conforme o padrão do clave designer
        let frequency = 440; // Frequência padrão (A4)
        let volume = 0.5; // Volume padrão

        // Calcula qual "semicolcheia" está a ser tocada no ciclo de 16
        const totalSubdivisions = beatsPerMeasure * subdivision; // Total de subdivisões no compasso atual
        const semicolchesPerSubdivision = 16 / totalSubdivisions;

        // Mapeia currentBeat e currentSubdivision para o índice da clavePattern
        let patternIndex = Math.floor(currentBeat * semicolchesPerSubdivision * subdivision) + Math.floor(currentSubdivision * semicolchesPerSubdivision);
        
        // Garante que o índice está dentro dos limites do array
        patternIndex = patternIndex % 16;
        
        const claveValue = clavePattern[patternIndex];

        if (claveValue === CLAVE_BEAT_1) { // Primeira batida do compasso (forte)
            frequency = 880; // Tom mais alto
            volume = 0.8;
            console.log(`Click: BEAT ${currentBeat + 1}, SUB ${currentSubdivision + 1} (FORTE)`);
        } else if (claveValue === CLAVE_BEAT_2) { // Outras batidas ou subdivisões (médio)
            frequency = 440;
            volume = 0.6;
            console.log(`Click: BEAT ${currentBeat + 1}, SUB ${currentSubdivision + 1} (MÉDIO)`);
        } else { // CLAVE_OFF - Não toca som
            console.log(`Click: BEAT ${currentBeat + 1}, SUB ${currentSubdivision + 1} (OFF)`);
            // Avança para o próximo tempo sem tocar som
            advanceBeat();
            continue; // Pula o resto da iteração e vai para o próximo agendamento
        }
        
        // Remove o indicador visual da batida anterior
        const prevActivePoint = claveGrid.querySelector('.clave-point.active-beat');
        if (prevActivePoint) {
            prevActivePoint.classList.remove('active-beat');
        }

        // Adiciona o indicador visual à batida atual
        const currentActivePoint = claveGrid.querySelector(`.clave-point[data-index="${patternIndex}"]`);
        if (currentActivePoint) {
            currentActivePoint.classList.add('active-beat');
        }

        createClickSound(frequency, 0.05, volume); // Toca o som agendado

        advanceBeat(); // Prepara para a próxima batida
    }
}

// Avança a lógica do metrónomo para a próxima batida/subdivisão
function advanceBeat() {
    const secondsPerBeat = 60.0 / currentBPM;
    const secondsPerSubdivision = secondsPerBeat / subdivision;

    nextClickTime += secondsPerSubdivision; // Avança o tempo de agendamento

    currentSubdivision++;
    if (currentSubdivision >= subdivision) {
        currentSubdivision = 0;
        currentBeat++;
        if (currentBeat >= beatsPerMeasure) {
            currentBeat = 0; // Reinicia o compasso
        }
    }
    updateMetronomeStatus();
}

async function startMetronome() {
    if (isPlaying) return;

    // Inicializa ou retoma o AudioContext
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
    nextClickTime = audioContext.currentTime; // Começa a agendar a partir de agora
    currentBeat = 0;
    currentSubdivision = 0;
    updateMetronomeStatus(); // Atualiza o status inicial

    // Inicia o loop de agendamento
    intervalId = setInterval(scheduler, lookahead);
    console.log('Metrónomo iniciado.');
}

function stopMetronome() {
    if (!isPlaying) return;

    isPlaying = false;
    clearInterval(intervalId); // Para o loop de agendamento
    playPauseBtn.textContent = '▶️ Iniciar';
    updateMetronomeStatus(); // Limpa o status
    
    // Remove o indicador visual da batida
    const activePoint = claveGrid.querySelector('.clave-point.active-beat');
    if (activePoint) {
        activePoint.classList.remove('active-beat');
    }

    console.log('Metrónomo parado.');
}

// --- Event Listeners ---

bpmSlider.addEventListener('input', updateBPMDisplay);
beatsPerMeasureSlider.addEventListener('input', updateBeatsPerMeasureDisplay);

subdivisionOffBtn.addEventListener('click', () => { subdivision = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivision = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivision = 3; updateSubdivisionButtons(); });

playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
});

stopBtn.addEventListener('click', stopMetronome);

// --- Inicialização ao Carregar a Página ---
document.addEventListener('DOMContentLoaded', () => {
    updateBPMDisplay();
    updateBeatsPerMeasureDisplay(); // Isso também renderiza a grelha inicial e inicializa o padrão
    updateSubdivisionButtons();
    updateMetronomeStatus();
    renderClaveGrid(); // Garante que a grelha é desenhada ao carregar
});
