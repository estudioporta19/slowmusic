// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let currentAudio = null; // O elemento <audio> HTML (usado principalmente para obter metadados e como proxy)
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, audioBuffer: AudioBuffer, fileName: string } }
let currentCell = null; // Guarda o número da célula ativa

let loopPoints = { start: null, end: null };
let isLooping = false;

// Web Audio API
let audioContext;
let currentSourceNode = null; // O AudioBufferSourceNode atualmente a tocar
let currentGainNode = null; // Nó de ganho para controlar volume (opcional, mas boa prática)
let isPlayingWithWebAudio = false; // Flag para saber se estamos a usar Web Audio API ou não

// Referências de elementos HTML
const audioPlayer = document.getElementById('audioPlayer'); // O elemento HTML <audio>
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

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o AudioContext assim que a página carrega
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    createCells();
    updateLoopDisplay();
    // NÃO aplique speed e pitch diretamente aqui, use applyAudioSettings no playAudio
    applySpeed(parseFloat(speedSlider.value)); // Apenas para atualizar o valor exibido
    applyPitch(parseInt(pitchSlider.value)); // Apenas para atualizar o valor exibido
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
    // Parar a reprodução Web Audio API se estiver ativa
    if (currentSourceNode) {
        currentSourceNode.stop();
        currentSourceNode.disconnect();
        currentSourceNode = null;
        if (currentGainNode) { // Verifica se o gainNode existe antes de desconectar
            currentGainNode.disconnect();
            currentGainNode = null;
        }
        isPlayingWithWebAudio = false;
    }
    
    // Resetar o elemento <audio> HTML (como proxy)
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.src = ''; 
    }
    currentAudio = null; // Redefine o proxy
    currentCell = null;
    clearLoop();
    progressFill.style.width = '0%';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';

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
                fileName: fileNameWithoutExtension || file.name
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

// Nova função para aplicar configurações de áudio (velocidade e pitch)
function applyAudioSettings(sourceNode, speed, pitchCents) {
    sourceNode.playbackRate.value = speed;
    
    // Compensar o pitch induzido pela velocidade
    // pitchChangeInCents = Math.log2(speed) * 1200;
    // DetuneFinal = (pitchCents do slider) - pitchChangeInCents
    const speedPitchCompensation = Math.log2(speed) * 1200;
    sourceNode.detune.value = pitchCents - speedPitchCompensation;
}

function playAudio(cellNumber, startOffset = 0) {
    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.audioBuffer) {
        console.warn(`Nenhum áudio decodificado na célula ${cellNumber}.`);
        return;
    }

    // Parar qualquer reprodução Web Audio API anterior
    if (currentSourceNode) {
        currentSourceNode.stop();
        currentSourceNode.disconnect();
        currentSourceNode = null;
        if (currentGainNode) {
             currentGainNode.disconnect();
             currentGainNode = null;
        }
    }
    
    // Desativar célula ativa anterior
    if (currentCell) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }

    // Resetar e ativar a nova célula
    if (currentCell !== cellNumber) { // Só limpa o loop se mudar de música
        clearLoop(); 
    }
    currentCell = cellNumber;
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');

    // --- Configurar e Iniciar Web Audio API Playback ---
    currentSourceNode = audioContext.createBufferSource();
    currentSourceNode.buffer = audioData.audioBuffer;

    if (!currentGainNode) { // Cria o nó de ganho apenas uma vez se ainda não existir
        currentGainNode = audioContext.createGain(); 
        currentGainNode.connect(audioContext.destination);
    }
    
    currentSourceNode.connect(currentGainNode);

    // Aplicar velocidade e pitch usando a nova função
    const currentSpeed = parseFloat(speedSlider.value);
    const currentPitch = parseInt(pitchSlider.value);
    applyAudioSettings(currentSourceNode, currentSpeed, currentPitch);

    // Ajustar a duração total exibida
    document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    // Para simular o currentTime do <audio> HTML
    currentSourceNode._startTime = audioContext.currentTime;
    currentSourceNode._seekOffset = startOffset; // Armazena o offset para cálculo do tempo

    // Quando o áudio termina (no Web Audio API)
    currentSourceNode.onended = () => {
        if (!isLooping) {
            // Se não estiver em loop, tratar como "ended" normal
            if (currentCell) {
                document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
            }
            currentAudio = null; 
            currentCell = null;
            clearLoop();
            progressFill.style.width = '0%';
            document.getElementById('currentTime').textContent = '0:00';
            document.getElementById('totalTime').textContent = '0:00';
            isPlayingWithWebAudio = false;
        } else {
            // Se estiver em loop, reiniciar para o ponto de loop
            if (loopPoints.start !== null && loopPoints.end !== null) {
                // Parar o nó atual para reiniciar
                currentSourceNode.stop();
                currentSourceNode.disconnect(); 

                // Criar e conectar um novo nó de fonte
                currentSourceNode = audioContext.createBufferSource();
                currentSourceNode.buffer = audioData.audioBuffer;
                currentSourceNode.connect(currentGainNode); 
                //currentGainNode.connect(audioContext.destination); // Já está conectado

                // Aplicar velocidade e pitch novamente ao novo nó
                applyAudioSettings(currentSourceNode, currentSpeed, currentPitch);

                // Recalcular seekOffset e playbackStartTime para o loop
                currentSourceNode._seekOffset = loopPoints.start;
                currentSourceNode._startTime = audioContext.currentTime;

                currentSourceNode.start(0, loopPoints.start); // Começa do ponto de loop
                currentSourceNode.onended = this; // Reatribui o handler onended
            }
        }
    };

    currentSourceNode.start(0, startOffset); // Iniciar no offset fornecido
    isPlayingWithWebAudio = true;

    // Atualiza a UI da barra de progresso e tempo a cada 100ms
    const updateProgressInterval = setInterval(() => {
        if (!isPlayingWithWebAudio || !currentSourceNode || !audioData.audioBuffer) {
            clearInterval(updateProgressInterval);
            return;
        }

        // Tempo atual = (Tempo real do contexto - Tempo de início da reprodução) * Velocidade + Offset de busca
        let elapsedTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
        
        // Se a reprodução chegar ao fim da música (ou do loop end)
        if (elapsedTime >= audioData.audioBuffer.duration) {
            // Para evitar que a barra de progresso exceda 100% no final da música antes do 'onended' ser acionado
            elapsedTime = audioData.audioBuffer.duration; 
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
    applySpeed(newSpeed); // Atualiza apenas o display e os valores internos
    if (currentSourceNode) {
        // Aplica as novas configurações ao nó de áudio ativo
        const currentPitch = parseInt(pitchSlider.value);
        applyAudioSettings(currentSourceNode, newSpeed, currentPitch);
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitch = parseInt(e.target.value);
    applyPitch(newPitch); // Atualiza apenas o display e os valores internos
    if (currentSourceNode) {
        // Aplica as novas configurações ao nó de áudio ativo
        const currentSpeed = parseFloat(speedSlider.value);
        applyAudioSettings(currentSourceNode, currentSpeed, newPitch);
    }
});
pitchSlider.addEventListener('mouseup', function() { this.blur(); });
pitchSlider.addEventListener('touchend', function() { this.blur(); });

function applySpeed(speed) {
    speedSlider.value = speed;
    speedValue.textContent = speed.toFixed(2) + 'x';
}

function applyPitch(pitchCents) {
    pitchSlider.value = pitchCents;
    pitchValue.textContent = (pitchCents / 100) + ' semitons'; 
}


// --- Atalhos do Teclado ---
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
        return;
    }

    if (!currentSourceNode || !audioFiles[currentCell]) return;

    // Pausar/Reproduzir com a Web Audio API é um pouco diferente
    const audioData = audioFiles[currentCell];

    switch(e.key.toLowerCase()) {
        case 'a':
            setLoopPoint('start');
            break;
        case 'b':
            setLoopPoint('end');
            break;
        case 'x':
            clearLoop();
            break;
        case ' ':
            e.preventDefault();
            if (isPlayingWithWebAudio) {
                // Pausar: Para a reprodução e calcula o tempo atual para retomar
                let currentPlaybackTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
                if (currentPlaybackTime < 0) currentPlaybackTime = 0; // Safeguard

                currentSourceNode.stop();
                currentSourceNode.disconnect();
                currentSourceNode = null; // Zera o nó
                
                // Armazena o tempo de pausa na célula
                audioFiles[currentCell].lastPlaybackTime = currentPlaybackTime;
                isPlayingWithWebAudio = false;

            } else {
                // Reproduzir: Tenta retomar do último tempo conhecido ou do início
                const resumeTime = audioFiles[currentCell].lastPlaybackTime || 0;
                playAudio(currentCell, resumeTime);
                audioFiles[currentCell].lastPlaybackTime = 0; // Limpa após retomar
            }
            break;
    }
});

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;
    
    // Calcular o tempo atual de forma mais precisa
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
    if (!currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) {
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
    if (!currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;

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
        
        // Parar e recriar o AudioBufferSourceNode para saltar no tempo
        if (currentSourceNode) {
            currentSourceNode.stop();
            currentSourceNode.disconnect();
            currentSourceNode = null; 
            isPlayingWithWebAudio = false; // Define como não está a tocar até ser reiniciado
        }

        // Recria e inicia a reprodução do ponto clicado
        playAudio(currentCell, newTime); // Inicia do novo tempo
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingLoopHandle || !currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;

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
        // Se a célula já está ativa e a tocar, pausar/retomar
        if (currentCell === cellNumber && isPlayingWithWebAudio) {
            // Pausar
            let currentPlaybackTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
            if (currentPlaybackTime < 0) currentPlaybackTime = 0;

            currentSourceNode.stop();
            currentSourceNode.disconnect();
            currentSourceNode = null;
            audioFiles[currentCell].lastPlaybackTime = currentPlaybackTime;
            isPlayingWithWebAudio = false;
        } else if (currentCell === cellNumber && !isPlayingWithWebAudio && audioFiles[cellNumber] && audioFiles[cellNumber].lastPlaybackTime !== undefined) {
            // Retomar
            playAudio(cellNumber, audioFiles[cellNumber].lastPlaybackTime);
            audioFiles[cellNumber].lastPlaybackTime = 0; // Limpa após retomar
        } else {
            // Iniciar nova reprodução (ou reiniciar do zero se não houver tempo de pausa)
            playAudio(cellNumber);
        }
    }
});
