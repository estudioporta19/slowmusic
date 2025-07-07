// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, audioBuffer: AudioBuffer, fileName: string, lastPlaybackTime: number } }
let currentCell = null; // Guarda o número da célula ativa

let loopPoints = { start: null, end: null };
let isLooping = false;

// Web Audio API
let audioContext;
let currentSourceNode = null; // O AudioBufferSourceNode atualmente a tocar
let currentGainNode = null; // Nó de ganho
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
const speedPreset05 = document.getElementById('speedPreset05');
const speedPreset10 = document.getElementById('speedPreset10');

const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');

const totalCells = 20;

let isDraggingLoopHandle = false;
let activeLoopHandle = null; // 'start' or 'end'

let progressUpdateInterval = null; // Para controlar o setInterval

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Cria o nó de ganho uma vez e conecta ao destino
    currentGainNode = audioContext.createGain(); 
    currentGainNode.connect(audioContext.destination);

    createCells();
    updateLoopDisplay();
    // Apenas atualiza o display dos sliders, as configs reais são aplicadas no playAudio
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

// --- Lógica de Carregamento e Reprodução de Áudio (Web Audio API) ---

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
                lastPlaybackTime: 0 // Inicia com 0
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

// Função para aplicar configurações de áudio (velocidade e pitch)
function applyAudioSettings(sourceNode, speed, pitchCents) {
    sourceNode.playbackRate.value = speed;
    
    // Compensar o pitch induzido pela velocidade
    const speedPitchCompensation = Math.log2(speed) * 1200;
    sourceNode.detune.value = pitchCents - speedPitchCompensation;
}

// Para a reprodução atual, limpa estados
function stopCurrentAudio() {
    if (currentSourceNode) {
        try {
            currentSourceNode.stop();
            currentSourceNode.disconnect();
        } catch (e) {
            console.warn("Erro ao parar currentSourceNode:", e);
        }
        currentSourceNode = null;
    }
    isPlaying = false;
    // Limpa o intervalo de atualização da barra de progresso
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
}

function playAudio(cellNumber, startOffset = 0) {
    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.audioBuffer) {
        console.warn(`Nenhum áudio decodificado na célula ${cellNumber}.`);
        return;
    }

    // Parar qualquer reprodução existente antes de iniciar uma nova
    stopCurrentAudio();
    
    // Desativar célula ativa anterior, se houver
    if (currentCell && document.querySelector(`.cell[data-cell-number="${currentCell}"]`)) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }

    // Atualizar célula ativa
    currentCell = cellNumber;
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');

    // Se mudou de faixa, limpar loop
    // Verificação simplificada, sempre limpa o loop se a célula mudar
    if (audioData.lastCellId !== currentCell) { 
        clearLoop();
    }
    audioData.lastCellId = currentCell; // Marca a última célula para referência

    // --- Configurar e Iniciar Web Audio API Playback ---
    currentSourceNode = audioContext.createBufferSource();
    currentSourceNode.buffer = audioData.audioBuffer;
    currentSourceNode.connect(currentGainNode); // Conecta ao nó de ganho já existente

    // Aplicar velocidade e pitch usando a função
    const currentSpeed = parseFloat(speedSlider.value);
    const currentPitch = parseInt(pitchSlider.value);
    applyAudioSettings(currentSourceNode, currentSpeed, currentPitch);

    // Ajustar a duração total exibida
    document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    // Salvar o tempo de início e offset para cálculo preciso do tempo decorrido
    currentSourceNode._startTime = audioContext.currentTime;
    currentSourceNode._seekOffset = startOffset; 

    // Lidar com o final da reprodução ou loop
    currentSourceNode.onended = () => {
        if (!isLooping) {
            stopCurrentAudio(); // Limpar tudo
            // Resetar UI para estado inicial
            if (currentCell) {
                document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
            }
            currentCell = null;
            clearLoop();
            progressFill.style.width = '0%';
            document.getElementById('currentTime').textContent = '0:00';
            document.getElementById('totalTime').textContent = '0:00';
        } else {
            // Se estiver em loop, reiniciar a reprodução do ponto de loop
            if (loopPoints.start !== null && loopPoints.end !== null) {
                // Usamos playAudio para recriar o nó de forma limpa e aplicar as configs
                playAudio(currentCell, loopPoints.start);
            }
        }
    };

    currentSourceNode.start(0, startOffset); // Iniciar no offset fornecido
    isPlaying = true;

    // Inicia ou reinicia o intervalo de atualização da barra de progresso
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
        if (!isPlaying || !currentSourceNode || !audioData.audioBuffer) {
            clearInterval(progressUpdateInterval);
            progressUpdateInterval = null;
            return;
        }

        let elapsedTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
        
        // Limita o tempo decorrido para não exceder a duração total (ou o ponto final do loop) para o display
        const displayDuration = isLooping && loopPoints.end !== null ? loopPoints.end : audioData.audioBuffer.duration;
        if (elapsedTime >= displayDuration) {
            elapsedTime = displayDuration; 
        }

        let progress = (elapsedTime / audioData.audioBuffer.duration) * 100;
        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(elapsedTime);
        document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    }, 100);
}

// --- Controles de Velocidade e Pitch ---
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); // Atualiza apenas o display
    if (isPlaying && currentCell !== null) {
        // Se estiver a tocar, reinicia a reprodução com as novas configurações
        const currentTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
        playAudio(currentCell, currentTime);
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitch = parseInt(e.target.value);
    applyPitchToDisplay(newPitch); // Atualiza apenas o display
    if (isPlaying && currentCell !== null) {
        // Se estiver a tocar, reinicia a reprodução com as novas configurações
        const currentTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
        playAudio(currentCell, currentTime);
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
    // Ignora inputs de texto ou botões
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.slider')) {
        return;
    }

    if (!audioFiles[currentCell]) return; // Precisa ter um áudio carregado em alguma célula

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
            e.preventDefault(); // Previne a rolagem da página
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

    if (isPlaying) {
        // Pausar: Guarda o tempo atual e para o áudio
        const currentTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
        audioFiles[currentCell].lastPlaybackTime = Math.max(0, currentTime); // Garante que não seja negativo
        
        stopCurrentAudio();
    } else {
        // Reproduzir: Inicia do último tempo de pausa ou do início
        const resumeTime = audioFiles[currentCell].lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioFiles[currentCell].lastPlaybackTime = 0; // Limpa após retomar
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;
    
    let currentTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
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
