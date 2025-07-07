// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, audioBuffer: AudioBuffer, fileName: string, lastPlaybackTime: number, soundTouch: SoundTouch, soundTouchSource: AudioBufferSourceNode, scriptProcessorNode: ScriptProcessorNode } }
let currentCell = null; // Guarda o número da célula ativa

let loopPoints = { start: null, end: null };
let isLooping = false;

// Web Audio API
let audioContext;
let currentSourceNode = null; // O AudioBufferSourceNode que alimenta o SoundTouch
let currentGainNode = null; // Nó de ganho principal
let currentScriptProcessorNode = null; // Nó que faz o processamento com SoundTouch
let isPlaying = false; // Flag para saber se estamos a tocar

// Referências de elementos HTML
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const loopMarkers = document.getElementById('loopMarkers');
const loopHandleA = document.getElementById('loopHandleA');
const loopHandleB = document.getElementById('loopHandleB');

const globalFileInput = document.getElementById('globalFileInput');
const globalUploadBtn = document.getElementById('globalUploadBtn');
const globalUploadStatus = document.getElementById('globalUploadStatus');
const clearCellsBtn = document.getElementById('clearCellsBtn');

const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');

const totalCells = 20;

let isDraggingLoopHandle = false;
let activeLoopHandle = null; // 'start' or 'end'

let progressUpdateInterval = null; // Para controlar o setInterval

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Cria o nó de ganho principal e conecta ao destino
    currentGainNode = audioContext.createGain(); 
    currentGainNode.connect(audioContext.destination);

    createCells();
    updateLoopDisplay();
    applySpeedToDisplay(parseFloat(speedSlider.value));
    applyPitchToDisplay(parseInt(pitchSlider.value));
    updateLoopMarkers();
});

// --- Funções Auxiliares ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- Gestão de Células ---
function createCells() {
    const grid = document.getElementById('cellGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-cell-number', i);
        cell.innerHTML = `
            <div class="file-name" id="fileName${i}">Vazia</div>
        `;
        grid.appendChild(cell);
    }
}

function clearAllCells() {
    stopCurrentAudio(); // Parar e limpar qualquer reprodução atual

    for (let i = 1; i <= totalCells; i++) {
        if (audioFiles[i] && audioFiles[i].fileURL) {
            URL.revokeObjectURL(audioFiles[i].fileURL);
        }
        delete audioFiles[i]; 
        document.getElementById(`fileName${i}`).textContent = 'Vazia';
        const cell = document.querySelector(`.cell[data-cell-number="${i}"]`);
        if (cell) cell.classList.remove('active');
    }
    globalUploadStatus.textContent = 'Células limpas.';
}

// --- Lógica de Carregamento e Reprodução de Áudio (Web Audio API com SoundTouch) ---

async function loadAudioBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const audioBuffer = await audioContext.decodeAudioData(reader.result);
                resolve(audioBuffer);
            } catch (e) {
                console.error("Erro ao decodificar áudio:", e);
                reject(e);
            }
        };
        reader.onerror = (e) => {
            console.error("Erro ao ler ficheiro:", e);
            reject(e);
        };
        reader.readAsArrayBuffer(file);
    });
}

globalUploadBtn.addEventListener('click', () => {
    globalFileInput.click();
});

globalFileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files.length === 0) {
        globalUploadStatus.textContent = 'Nenhum ficheiro selecionado.';
        return;
    }

    globalUploadStatus.textContent = `A carregar ${files.length} ficheiro(s)...`;
    clearAllCells(); 

    let filesLoaded = 0;
    let cellIndex = 1;

    for (let i = 0; i < files.length && cellIndex <= totalCells; i++) {
        const file = files[i];

        if (!file.type.startsWith('audio/')) {
            console.warn(`Ficheiro "${file.name}" não é um ficheiro de áudio. Ignorando.`);
            continue;
        }

        try {
            const audioBuffer = await loadAudioBuffer(file);
            const fileURL = URL.createObjectURL(file); 
            const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');

            audioFiles[cellIndex] = {
                fileURL: fileURL,
                audioBuffer: audioBuffer,
                fileName: fileNameWithoutExtension || file.name,
                lastPlaybackTime: 0,
                soundTouch: null, // Será inicializado ao tocar
                soundTouchSource: null,
                scriptProcessorNode: null
            };

            document.getElementById(`fileName${cellIndex}`).textContent = audioFiles[cellIndex].fileName;
            filesLoaded++;
            cellIndex++;
        } catch (error) {
            console.error(`Falha ao carregar ou decodificar ${file.name}:`, error);
        }
    }
    globalUploadStatus.textContent = `${filesLoaded} ficheiro(s) carregado(s) com sucesso.`;
    if (filesLoaded === 0 && files.length > 0) {
        globalUploadStatus.textContent = 'Nenhum ficheiro de áudio válido carregado.';
    }
    event.target.value = ''; 
});

clearCellsBtn.addEventListener('click', clearAllCells);

// Para a reprodução atual e limpa nós do SoundTouch
function stopCurrentAudio() {
    if (currentScriptProcessorNode) {
        try {
            currentScriptProcessorNode.disconnect();
        } catch (e) {
            console.warn("Erro ao desconectar scriptProcessorNode:", e);
        }
        currentScriptProcessorNode = null;
    }
    if (currentSourceNode) {
        try {
            currentSourceNode.stop();
            currentSourceNode.disconnect();
        } catch (e) {
            console.warn("Erro ao parar currentSourceNode (SoundTouch):", e);
        }
        currentSourceNode = null;
    }
    isPlaying = false;
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
    currentGainNode.gain.cancelAndHoldAtTime(audioContext.currentTime);
    currentGainNode.gain.setValueAtTime(1, audioContext.currentTime); 
}

function playAudio(cellNumber, startOffset = 0) {
    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.audioBuffer) {
        console.warn(`Nenhum áudio decodificado na célula ${cellNumber}.`);
        return;
    }

    stopCurrentAudio();

    // Desativar célula ativa anterior
    if (currentCell && document.querySelector(`.cell[data-cell-number="${currentCell}"]`)) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }

    currentCell = cellNumber;
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');

    // Se mudou de faixa, limpar loop
    if (audioData.lastCellId !== currentCell) { 
        clearLoop();
    }
    audioData.lastCellId = currentCell; 

    // --- Configurar SoundTouch.js ---
    const sampleRate = audioData.audioBuffer.sampleRate;
    const channels = audioData.audioBuffer.numberOfChannels;

    // Cria uma nova instância SoundTouch para cada reprodução
    audioData.soundTouch = new SoundTouch();
    audioData.soundTouch.setSampleRate(sampleRate);
    audioData.soundTouch.setChannels(channels);

    const currentSpeed = parseFloat(speedSlider.value);
    const currentPitchCents = parseInt(pitchSlider.value);

    // SoundTouch usa rate para velocidade e semitones para pitch
    audioData.soundTouch.setRate(currentSpeed); 
    audioData.soundTouch.setPitchSemiTones(currentPitchCents / 100); // Converte cents para semitons

    // Criar um novo AudioBufferSourceNode para alimentar o SoundTouch
    currentSourceNode = audioContext.createBufferSource();
    currentSourceNode.buffer = audioData.audioBuffer;
    currentSourceNode._startOffset = startOffset; // Guarda o offset de início

    // Criar o ScriptProcessorNode para interagir com SoundTouch
    const bufferSize = 4096; // Tamanho do buffer de processamento
    currentScriptProcessorNode = audioContext.createScriptProcessor(bufferSize, channels, channels);

    currentScriptProcessorNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const outputBuffer = event.outputBuffer;

        // Envia o áudio de entrada para o SoundTouch
        if (inputBuffer.numberOfChannels === 1) {
            audioData.soundTouch.putSamples(inputBuffer.getChannelData(0));
        } else if (inputBuffer.numberOfChannels === 2) {
            audioData.soundTouch.putSamples(inputBuffer.getChannelData(0), inputBuffer.getChannelData(1));
        }

        // Pede o áudio processado ao SoundTouch
        const processedSamples = audioData.soundTouch.receiveSamples();

        // Escreve os samples processados no buffer de saída
        if (outputBuffer.numberOfChannels === 1) {
            outputBuffer.getChannelData(0).set(processedSamples);
        } else if (outputBuffer.numberOfChannels === 2) {
            outputBuffer.getChannelData(0).set(processedSamples[0]);
            outputBuffer.getChannelData(1).set(processedSamples[1]);
        }

        // Se o SoundTouch não tiver mais samples e a fonte original parou, indica o fim
        if (audioData.soundTouch.isEmpty() && currentSourceNode._hasEnded) {
            currentSourceNode.onended(); // Força o evento onended
        }
    };

    // Conecta os nós: Source -> ScriptProcessor -> Gain -> Destination
    currentSourceNode.connect(currentScriptProcessorNode);
    currentScriptProcessorNode.connect(currentGainNode);

    // Lidar com o final da reprodução do SoundTouch (quando a fonte original acaba)
    currentSourceNode.onended = () => {
        currentSourceNode._hasEnded = true; // Flag para indicar que a fonte original parou
        // A verdadeira paragem acontece no onaudioprocess quando soundTouch.isEmpty()
        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            // Reinicia o loop com o novo offset
            playAudio(currentCell, loopPoints.start);
        } else if (audioData.soundTouch.isEmpty()) {
            // Se não está em loop e o SoundTouch não tem mais samples, para
            stopCurrentAudio(); 
            if (currentCell) {
                document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
            }
            currentCell = null;
            clearLoop();
            progressFill.style.width = '0%';
            document.getElementById('currentTime').textContent = '0:00';
            document.getElementById('totalTime').textContent = '0:00';
        }
    };

    currentSourceNode.start(0, startOffset); 
    isPlaying = true;

    document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    // Inicia ou reinicia o intervalo de atualização da barra de progresso
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
        if (!isPlaying || !currentSourceNode || !audioData.soundTouch || !audioData.audioBuffer) {
            clearInterval(progressUpdateInterval);
            progressUpdateInterval = null;
            return;
        }

        // O tempo real é mais complexo com time-stretching.
        // Precisamos calcular a duração teórica do áudio processado.
        // tempo_atual_audio_original = (audioContext.currentTime - currentSourceNode._startTime)
        // tempo_atual_processado = tempo_atual_audio_original * currentSpeed + startOffset

        // O SoundTouch não expõe um currentTime diretamente,
        // então precisamos de estimá-lo com base nos dados que ele processou
        // e no playbackRate definido.

        const theoreticalPlaybackRate = parseFloat(speedSlider.value);
        const nominalDuration = audioData.audioBuffer.duration;
        const processedDuration = nominalDuration / theoreticalPlaybackRate;

        // Estimativa do tempo decorrido com base na duração processada e no progresso.
        // Isto pode não ser 100% exato com o SoundTouch mas é uma boa aproximação.
        let estimatedTime = (audioContext.currentTime - currentSourceNode._startTime + currentSourceNode._startOffset / theoreticalPlaybackRate);

        // Ajusta o tempo se houver loop points ativos
        const effectiveDuration = isLooping && loopPoints.end !== null ? (loopPoints.end - loopPoints.start) : nominalDuration;
        let progress;

        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            // Se estiver em loop, o progresso é dentro do segmento de loop
            const currentLoopTime = (audioContext.currentTime - currentSourceNode._startTime) * theoreticalPlaybackRate + currentSourceNode._startOffset;
            progress = ((currentLoopTime - loopPoints.start) / (loopPoints.end - loopPoints.start)) * 100;
            // Ajustar para o display de tempo para ficar dentro do loop
            estimatedTime = loopPoints.start + (currentLoopTime - loopPoints.start);
        } else {
            progress = (estimatedTime / nominalDuration) * 100;
        }

        progress = Math.min(100, Math.max(0, progress)); // Limita o progresso entre 0 e 100
        estimatedTime = Math.min(nominalDuration, Math.max(0, estimatedTime)); // Limita o tempo

        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(estimatedTime);

        // A duração total exibida continua a ser a duração original do ficheiro
        document.getElementById('totalTime').textContent = formatTime(nominalDuration);

    }, 100);
}

// --- Controles de Velocidade e Pitch ---
// Estas funções agora apenas atualizam as propriedades SoundTouch
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].soundTouch) {
        audioFiles[currentCell].soundTouch.setRate(newSpeed);
        // Reajusta a _startTime para a barra de progresso acompanhar melhor
        currentSourceNode._startTime = audioContext.currentTime - (audioFiles[currentCell].lastPlaybackTime / newSpeed);
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitch = parseInt(e.target.value);
    applyPitchToDisplay(newPitch); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].soundTouch) {
        audioFiles[currentCell].soundTouch.setPitchSemiTones(newPitch / 100);
    }
});
pitchSlider.addEventListener('mouseup', function() { this.blur(); });
pitchSlider.addEventListener('touchend', function() { this.blur(); });

function applySpeedToDisplay(speed) {
    speedSlider.value = speed;
    speedValue.textContent = speed.toFixed(2) + 'x';
}

function applyPitchToDisplay(pitchCents) {
    pitchSlider.value = pitchCents;
    pitchValue.textContent = (pitchCents / 100) + ' semitons'; 
}


// --- Atalhos do Teclado ---
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.slider')) {
        return;
    }

    if (!audioFiles[currentCell]) return;

    switch(e.key.toLowerCase()) {
        case 'a':
            if (isPlaying) setLoopPoint('start');
            break;
        case 'b':
            if (isPlaying) setLoopPoint('end');
            break;
        case 'x':
            clearLoop();
            break;
        case ' ':
            e.preventDefault(); 
            togglePlayPause();
            break;
    }
});

// Nova função para gerir play/pause
function togglePlayPause() {
    if (!currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) {
        console.warn("Nenhum áudio selecionado ou carregado para reproduzir/pausar.");
        return;
    }

    const audioData = audioFiles[currentCell];

    if (isPlaying) {
        // Pausar: Guarda o tempo atual e para o áudio
        // O tempo de playback é a posição atual no AudioBuffer original
        // O SoundTouch.js não expõe diretamente o currentTime no áudio resultante
        // Então, estimamos com base no que foi processado.
        let currentTime = (audioContext.currentTime - currentSourceNode._startTime) * parseFloat(speedSlider.value) + currentSourceNode._startOffset;
        audioData.lastPlaybackTime = Math.max(0, currentTime);

        stopCurrentAudio();
    } else {
        // Reproduzir: Inicia do último tempo de pausa ou do início
        const resumeTime = audioData.lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioData.lastPlaybackTime = 0; // Limpa após retomar
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!isPlaying || !currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;

    // Calcular o tempo atual da faixa original para o ponto de loop
    let currentTime = (audioContext.currentTime - currentSourceNode._startTime) * parseFloat(speedSlider.value) + currentSourceNode._startOffset;
    if (isNaN(currentTime) || currentTime < 0) currentTime = 0; 

    const duration = audioFiles[currentCell].audioBuffer.duration;
    const adjustedTime = Math.min(Math.max(0, currentTime), duration);
    loopPoints[point] = adjustedTime;

    const pointAElement = document.getElementById('pointA');
    const pointBElement = document.getElementById('pointB');

    if (point === 'start') {
        pointAElement.textContent = formatTime(adjustedTime);
        pointAElement.classList.add('loop-point-highlight');
        setTimeout(() => {
            pointAElement.classList.remove('loop-point-highlight');
        }, 800);
    } else {
        pointBElement.textContent = formatTime(adjustedTime);
        pointBElement.classList.add('loop-point-highlight');
        setTimeout(() => {
            pointBElement.classList.remove('loop-point-highlight');
        }, 800);

        if (loopPoints.start !== null) {
            activateLoop();
        }
    }

    updateLoopDisplay();
    updateLoopMarkers();
}

function activateLoop() {
    if (loopPoints.start !== null && loopPoints.end !== null) {
        if (loopPoints.start > loopPoints.end) {
            [loopPoints.start, loopPoints.end] = [loopPoints.end, loopPoints.start];
            document.getElementById('pointA').textContent = formatTime(loopPoints.start);
            document.getElementById('pointB').textContent = formatTime(loopPoints.end);
        }
        isLooping = true;
        updateLoopDisplay();
        updateLoopMarkers();
    }
}

function clearLoop() {
    loopPoints.start = null;
    loopPoints.end = null;
    isLooping = false;
    document.getElementById('pointA').textContent = '--';
    document.getElementById('pointB').textContent = '--';
    updateLoopDisplay();
    updateLoopMarkers();
}

function updateLoopDisplay() {
    const loopIndicator = document.getElementById('loopIndicator');
    const loopStatus = document.getElementById('loopStatus');
    const loopPointsDiv = document.getElementById('loopPoints');

    if (isLooping) {
        loopIndicator.classList.add('loop-active');
        loopStatus.textContent = 'Ativado';
        loopPointsDiv.style.display = 'block';
    } else {
        loopIndicator.classList.remove('loop-active');
        loopStatus.textContent = 'Desativado';
        loopPointsDiv.style.display = 'none';
    }
}

function updateLoopMarkers() {
    if (!audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) {
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
        return;
    }

    const duration = audioFiles[currentCell].audioBuffer.duration;

    if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
        const startPercent = (loopPoints.start / duration) * 100;
        const endPercent = (loopPoints.end / duration) * 100;

        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = (endPercent - startPercent) + '%';
        loopMarkers.classList.add('active');
        loopMarkers.style.display = 'block';
        loopMarkers.style.background = 'rgba(255, 255, 0, 0.2)';

        loopHandleA.style.left = (loopPoints.start / duration) * 100 + '%';
        loopHandleB.style.left = (loopPoints.end / duration) * 100 + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'block';

    } else if (loopPoints.start !== null) {
        const startPercent = (loopPoints.start / duration) * 100;

        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = '2px';
        loopMarkers.classList.add('active');
        loopMarkers.style.display = 'block';
        loopMarkers.style.background = 'transparent';

        loopHandleA.style.left = startPercent + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'none';

    } else {
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
    }
}

// --- Lógica de Arraste dos Marcadores e Cliques na ProgressBar ---
progressBar.addEventListener('mousedown', (e) => {
    if (!audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;

    if (e.target === loopHandleA) {
        isDraggingLoopHandle = true;
        activeLoopHandle = 'start';
    } else if (e.target === loopHandleB) {
        isDraggingLoopHandle = true;
        activeLoopHandle = 'end';
    } else {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * audioFiles[currentCell].audioBuffer.duration;

        playAudio(currentCell, newTime); // Inicia do novo tempo
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingLoopHandle || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;

    e.preventDefault();

    const rect = progressBar.getBoundingClientRect();
    let newX = e.clientX - rect.left;
    newX = Math.max(0, Math.min(newX, rect.width));

    const percentage = newX / rect.width;
    const newTime = percentage * audioFiles[currentCell].audioBuffer.duration;

    if (activeLoopHandle === 'start') {
        loopPoints.start = newTime;
        if (loopPoints.end !== null && loopPoints.start > loopPoints.end) {
            loopPoints.start = loopPoints.end;
        }
        document.getElementById('pointA').textContent = formatTime(loopPoints.start);
    } else if (activeLoopHandle === 'end') {
        loopPoints.end = newTime;
        if (loopPoints.start !== null && loopPoints.end < loopPoints.start) {
            loopPoints.end = loopPoints.start;
        }
        document.getElementById('pointB').textContent = formatTime(loopPoints.end);
    }
    activateLoop();
    updateLoopMarkers();
});

document.addEventListener('mouseup', () => {
    if (isDraggingLoopHandle) {
        isDraggingLoopHandle = false;
        activeLoopHandle = null;
        activateLoop(); 
    }
});

// --- Delegação de Eventos para Células ---
document.getElementById('cellGrid').addEventListener('click', function(event) {
    const target = event.target;
    const cellElement = target.closest('.cell'); 
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);

        if (currentCell === cellNumber) { // Se clicou na célula já ativa
            togglePlayPause();
        } else { // Se clicou numa nova célula
            playAudio(cellNumber); 
        }
    }
});
