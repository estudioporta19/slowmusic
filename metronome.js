// --- Variáveis Globais do Metrónomo ---
let audioContext;
let isPlaying = false;
let currentBPM = 120;
let beatsPerMeasure = 4; // Tempos por compasso (ex: 4 para 4/4)
let subdivision = 1; // 1 = sem subdivisão, 2 = 8as, 3 = 12as

let nextClickTime = 0.0; // Próximo tempo de agendamento em segundos do AudioContext
let currentPatternIndex = 0; // NOVO: Índice atual no clavePattern (0 a 15)
let scheduleAheadTime = 0.1; // Quantos segundos para agendar no futuro
let lookahead = 25.0; // mseg: Quanto tempo para olhar à frente
let intervalId; // ID do setInterval para o agendamento

// Array para o Clave Designer: 16 elementos representando semicolcheias
// 0: Off, 1: Beat 1 (Forte), 2: Beat 2 (Médio)
const CLAVE_OFF = 0;
const CLAVE_BEAT_1 = 1; // Para a batida principal do tempo (ex: o 1 no 1-2-3-4)
const CLAVE_BEAT_2 = 2; // Para outras batidas ou subdivisões marcadas

let clavePattern = []; // Inicializado em initializeClavePattern

// Ajusta o padrão padrão para ser flexível com beatsPerMeasure
function initializeClavePattern() {
    clavePattern = new Array(16).fill(CLAVE_OFF); // Começa com tudo off
    // Define a primeira batida de cada tempo como CLAVE_BEAT_1 ou CLAVE_BEAT_2
    const semicolchesPerBeat = 16 / beatsPerMeasure; // Ex: 16/4 = 4 semicolches por batida

    for (let i = 0; i < beatsPerMeasure; i++) {
        const startIndex = Math.floor(i * semicolchesPerBeat);
        if (i === 0) {
            // A primeira batida do compasso é sempre a mais forte
            clavePattern[startIndex] = CLAVE_BEAT_1;
        } else {
            // As outras batidas principais do compasso são CLAVE_BEAT_2
            clavePattern[startIndex] = CLAVE_BEAT_2;
        }
    }
}
// initializeClavePattern(); // Chamada inicial movida para DOMContentLoaded para garantir elementos carregados

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

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);

    oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
    };
}

// --- Funções de Atualização da UI ---

function updateBPMDisplay() {
    currentBPM = parseInt(bpmSlider.value);
    bpmValueDisplay.textContent = currentBPM;
    // Se estiver a tocar, reinicia o agendamento para aplicar o novo BPM
    if (isPlaying) {
        clearInterval(intervalId);
        nextClickTime = audioContext.currentTime; // Reinicia o tempo para o próximo clique
        currentPatternIndex = 0; // Reinicia o padrão para evitar saltos estranhos
        intervalId = setInterval(scheduler, lookahead);
    }
}

function updateBeatsPerMeasureDisplay() {
    beatsPerMeasure = parseInt(beatsPerMeasureSlider.value);
    beatsPerMeasureValueDisplay.textContent = beatsPerMeasure;
    // Quando os tempos por compasso mudam, o padrão do clave designer pode precisar ser re-inicializado
    initializeClavePattern();
    renderClaveGrid(); // Re-renderiza a grelha
    if (isPlaying) { // Se o metrónomo estiver a tocar, reinicia para aplicar o novo compasso
        clearInterval(intervalId);
        nextClickTime = audioContext.currentTime;
        currentPatternIndex = 0;
        intervalId = setInterval(scheduler, lookahead);
    }
}

function updateSubdivisionButtons() {
    subdivisionOffBtn.classList.remove('selected');
    subdivision2Btn.classList.remove('selected');
    subdivision3Btn.classList.remove('selected');

    if (subdivision === 1) subdivisionOffBtn.classList.add('selected');
    else if (subdivision === 2) subdivision2Btn.classList.add('selected');
    else if (subdivision === 3) subdivision3Btn.classList.add('selected');

    // Se estiver a tocar, reinicia o agendamento para aplicar a nova subdivisão
    if (isPlaying) {
        clearInterval(intervalId);
        nextClickTime = audioContext.currentTime;
        currentPatternIndex = 0;
        intervalId = setInterval(scheduler, lookahead);
    }
}

function updateMetronomeStatus() {
    if (isPlaying) {
        // Calcula a batida principal e subdivisão para exibição de status
        const semicolchesPerBeat = 16 / beatsPerMeasure;
        const currentPrimaryBeat = Math.floor(currentPatternIndex / semicolchesPerBeat) + 1;
        
        // Calcula a subdivisão atual dentro da batida principal
        const currentSubBeatIndex = currentPatternIndex % semicolchesPerBeat;
        const subIndexInDisplay = Math.floor(currentSubBeatIndex / (semicolchesPerBeat / subdivision)) + 1;

        metronomeStatusDisplay.textContent = `Compasso: ${currentPrimaryBeat}/${beatsPerMeasure} Batida: ${subIndexInDisplay}/${subdivision}`;
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

        // Define a classe visual com base no padrão
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
        let frequency = 440; // Frequência padrão (A4)
        let volume = 0.0; // Começa com volume 0 e ajusta se for para tocar

        const claveValue = clavePattern[currentPatternIndex];

        if (claveValue === CLAVE_BEAT_1) {
            frequency = 880; // Tom mais alto
            volume = 0.8;
        } else if (claveValue === CLAVE_BEAT_2) {
            frequency = 440;
            volume = 0.6;
        } else { // CLAVE_OFF
            volume = 0.0; // Garante que não toca som
        }

        // Toca o som APENAS se o volume for maior que 0
        if (volume > 0.0) {
            createClickSound(frequency, 0.05, volume); // Toca o som agendado
        }

        // Remove o indicador visual da batida anterior
        const prevActivePoint = claveGrid.querySelector('.clave-point.active-beat');
        if (prevActivePoint) {
            prevActivePoint.classList.remove('active-beat');
        }

        // Adiciona o indicador visual à batida atual
        const currentActivePoint = claveGrid.querySelector(`.clave-point[data-index="${currentPatternIndex}"]`);
        if (currentActivePoint) {
            currentActivePoint.classList.add('active-beat');
        }

        advanceMetronomeTime(); // Prepara para a próxima semicolcheia
    }
}

// Avança a lógica do metrónomo para a próxima "semicolcheia" baseada no BPM e subdivisão
function advanceMetronomeTime() {
    // Calcula a duração de uma semicolcheia (1/16 de um compasso de 4/4)
    // Se o BPM é 120, há 2 batidas por segundo.
    // Em 4/4, 1 batida = 1 semínima.
    // 1 semínima = 4 semicolcheias.
    // Segundos por semínima = 60 / BPM.
    // Segundos por semicolcheia = (60 / BPM) / 4.
    const secondsPerSemicolcheia = (60.0 / currentBPM) / 4;
    
    // A subdivisão afeta quantas "sub-batidas" existem por cada batida principal.
    // O Clave Designer já opera em semicolcheias. Se tivermos subdivisão 2x,
    // significa que queremos 2 "cliques" para cada batida principal.
    // Se a subdivisão for 3x, queremos 3 cliques.
    // Isso afeta a cadência com que percorremos o `clavePattern`.
    
    // Ajustamos a cadência de avanço do 'nextClickTime' e do 'currentPatternIndex'
    // com base na subdivisão e nos tempos por compasso.
    
    // Total de 'clicks' que o metrónomo fará por compasso base (semicolcheias)
    const totalPatternLength = 16; // O nosso clavePattern tem 16 posições

    // O "intervalo" de tempo que cada posição do padrão representa.
    // Se subdivision=1, um avanço é 1 semicolcheia.
    // Se subdivision=2, um avanço é 1 semicolcheia / 2 (para adicionar cliques no meio).
    // Se subdivision=3, um avanço é 1 semicolcheia / 3 (para adicionar cliques no meio).
    const actualSecondsPerClick = secondsPerSemicolcheia / subdivision;

    nextClickTime += actualSecondsPerClick; // Avança o tempo de agendamento

    // Avança o índice do padrão
    currentPatternIndex++;
    if (currentPatternIndex >= totalPatternLength) {
        currentPatternIndex = 0; // Reinicia o padrão
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
    currentPatternIndex = 0; // Garante que começa do início do padrão
    updateMetronomeStatus(); // Atualiza o status inicial

    // Inicia o loop de agendamento
    // O scheduler é chamado a cada 'lookahead' milissegundos para agendar cliques futuros.
    // Isso garante agendamento preciso sem usar setTimeout/setInterval para cada clique.
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

// NOVO: Função para alternar o metrónomo
function toggleMetronome() {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
}


// --- Event Listeners ---

bpmSlider.addEventListener('input', updateBPMDisplay);
beatsPerMeasureSlider.addEventListener('input', updateBeatsPerMeasureDisplay);

subdivisionOffBtn.addEventListener('click', () => { subdivision = 1; updateSubdivisionButtons(); });
subdivision2Btn.addEventListener('click', () => { subdivision = 2; updateSubdivisionButtons(); });
subdivision3Btn.addEventListener('click', () => { subdivision = 3; updateSubdivisionButtons(); });

playPauseBtn.addEventListener('click', toggleMetronome); // Usa a nova função de toggle
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
    updateBPMDisplay();
    updateBeatsPerMeasureDisplay(); // Isto chama initializeClavePattern() e renderClaveGrid()
    updateSubdivisionButtons();
    updateMetronomeStatus();
    // renderClaveGrid(); // Já é chamado por updateBeatsPerMeasureDisplay
    initializeClavePattern(); // Garante que o padrão é inicializado antes de qualquer uso
    renderClaveGrid(); // Renderiza a grelha inicial no carregamento
});
