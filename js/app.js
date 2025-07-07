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

// Novo slider para transposição
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
    applySpeed(parseFloat(speedSlider.value));
    applyPitch(parseInt(pitchSlider.value)); // Aplica pitch inicial
    updateLoopMarkers(); // Chama no início para garantir que os handles estejam ocultos
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
        currentGainNode.disconnect();
        currentGainNode = null;
        isPlayingWithWebAudio = false;
    }
    
    // Resetar o elemento <audio> HTML
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.src = ''; // Limpa a fonte
    }
    currentAudio = null;
    currentCell = null;
    clearLoop();
    progressFill.style.width = '0%';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';

    for (let i = 1; i <= totalCells; i++) {
        if (audioFiles[i] && audioFiles[i].fileURL) {
            URL.revokeObjectURL(audioFiles[i].fileURL);
        }
        delete audioFiles[i]; // Remove o objeto completo, incluindo audioBuffer
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
                // DecodeAudioData é assíncrono
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
    clearAllCells(); // Limpa antes de carregar novos

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
            const fileURL = URL.createObjectURL(file); // Mantém o fileURL para o elemento <audio> (fallback/metadata)
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
            // Poderia mostrar uma mensagem de erro na UI para este ficheiro específico
        }
    }
    globalUploadStatus.textContent = `${filesLoaded} ficheiro(s) carregado(s) com sucesso.`;
    if (filesLoaded === 0 && files.length > 0) {
        globalUploadStatus.textContent = 'Nenhum ficheiro de áudio válido carregado.';
    }
    event.target.value = ''; // Limpar o input file
});

clearCellsBtn.addEventListener('click', clearAllCells);

function playAudio(cellNumber) {
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
        currentGainNode.disconnect();
        currentGainNode = null;
    }
    
    // Desativar célula ativa anterior
    if (currentCell) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }

    // Resetar e ativar a nova célula
    clearLoop(); // Limpar loop ao trocar de ficheiro
    currentCell = cellNumber;
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');

    // --- Configurar e Iniciar Web Audio API Playback ---
    currentSourceNode = audioContext.createBufferSource();
    currentSourceNode.buffer = audioData.audioBuffer;

    currentGainNode = audioContext.createGain(); // Para controlo de volume, se precisar
    
    currentSourceNode.connect(currentGainNode);
    currentGainNode.connect(audioContext.destination);

    // Aplicar velocidade e pitch
    currentSourceNode.playbackRate.value = parseFloat(speedSlider.value);
    currentSourceNode.detune.value = parseInt(pitchSlider.value);

    // Ajustar a duração total exibida
    document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    // Para simular o currentTime do <audio> HTML (Web Audio não tem um currentTime direto para leitura)
    let playbackStartTime = audioContext.currentTime;
    let seekOffset = 0; // Se houver um seek, usaremos isso

    // Quando o áudio termina (no Web Audio API)
    currentSourceNode.onended = () => {
        if (!isLooping) {
            // Se não estiver em loop, tratar como "ended" normal
            if (currentCell) {
                document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
            }
            currentAudio = null; // Reinicia currentAudio proxy
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
                currentSourceNode.disconnect(); // Desconecta para evitar vazamentos de memória

                // Criar e conectar um novo nó de fonte
                currentSourceNode = audioContext.createBufferSource();
                currentSourceNode.buffer = audioData.audioBuffer;
                currentSourceNode.connect(currentGainNode); // Reconnectar ao nó de ganho existente
                currentGainNode.connect(audioContext.destination);

                // Aplicar velocidade e pitch novamente ao novo nó
                currentSourceNode.playbackRate.value = parseFloat(speedSlider.value);
                currentSourceNode.detune.value = parseInt(pitchSlider.value);

                // Recalcular seekOffset e playbackStartTime para o loop
                seekOffset = loopPoints.start;
                playbackStartTime = audioContext.currentTime;

                currentSourceNode.start(0, seekOffset); // Começa do ponto de loop
                currentSourceNode.onended = this; // Reatribui o handler onended
            }
        }
    };

    // Iniciar a reprodução
    currentSourceNode.start(0); // Começa imediatamente

    isPlayingWithWebAudio = true;

    // Atualiza a UI da barra de progresso e tempo a cada 100ms
    const updateProgressInterval = setInterval(() => {
        if (!isPlayingWithWebAudio || !currentSourceNode || !audioData.audioBuffer) {
            clearInterval(updateProgressInterval);
            return;
        }

        let elapsedTime = (audioContext.currentTime - playbackStartTime) * currentSourceNode.playbackRate.value + seekOffset;
        let progress = (elapsedTime / audioData.audioBuffer.duration) * 100;

        // Lógica de loop para o display (garantir que não passa do ponto B)
        if (isLooping && loopPoints.end !== null && elapsedTime >= loopPoints.end) {
            elapsedTime = loopPoints.start + (elapsedTime - loopPoints.end); // Mantém o tempo dentro do loop
            // Se o elapsedTime for maior que a duração total do buffer, pode causar problemas.
            // É melhor apenas mostrar o ponto A se atingiu o B
            elapsedTime = loopPoints.start;
            // A reprodução real já é reiniciada pelo onended
        }


        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(elapsedTime);
        document.getElementById('totalTime').textContent = formatTime(audioData.audioBuffer.duration);

    }, 100);
}


// --- Controles de Velocidade e Pitch ---
function applySpeed(speed) {
    speedSlider.value = speed;
    speedValue.textContent = speed.toFixed(2) + 'x';
    if (currentSourceNode) {
        currentSourceNode.playbackRate.value = speed;
    }
}

function applyPitch(pitchCents) {
    pitchSlider.value = pitchCents;
    // Converte de cents para semitons para exibição
    pitchValue.textContent = (pitchCents / 100) + ' semitons'; 
    if (currentSourceNode) {
        currentSourceNode.detune.value = pitchCents;
    }
}

speedSlider.addEventListener('input', (e) => {
    applySpeed(parseFloat(e.target.value));
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    applyPitch(parseInt(e.target.value));
});
pitchSlider.addEventListener('mouseup', function() { this.blur(); });
pitchSlider.addEventListener('touchend', function() { this.blur(); });


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
                // Pausar
                currentSourceNode.stop();
                currentSourceNode.disconnect();
                currentSourceNode = null;
                isPlayingWithWebAudio = false;
                // A logic para reiniciar no mesmo ponto precisaria ser mais elaborada,
                // por enquanto, ele para e um novo play reiniciaria do início
            } else {
                // Reproduzir (recria o nó)
                playAudio(currentCell); // Reinicia a partir do início ou ponto de loop
            }
            break;
    }
});

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!currentSourceNode || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return;
    
    // Calcular o tempo atual com base no contexto de áudio
    let currentTime = (audioContext.currentTime - currentSourceNode._startTime) * currentSourceNode.playbackRate.value + currentSourceNode._seekOffset;
    if (isNaN(currentTime) || currentTime < 0) currentTime = 0; // Fallback se não estiver a tocar
    
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
        // Se o clique não foi nos handles, é um clique normal na barra
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * audioFiles[currentCell].audioBuffer.duration;
        
        // Parar e recriar o AudioBufferSourceNode para saltar no tempo
        if (currentSourceNode) {
            currentSourceNode.stop();
            currentSourceNode.disconnect();
            currentSourceNode = null; // Zera o nó para recriar
        }

        // Recria e inicia a reprodução do ponto clicado
        const audioData = audioFiles[currentCell];
        currentSourceNode = audioContext.createBufferSource();
        currentSourceNode.buffer = audioData.audioBuffer;
        currentSourceNode.connect(currentGainNode); // Reconnecta ao nó de ganho existente
        currentGainNode.connect(audioContext.destination);

        // Aplica velocidade e pitch
        currentSourceNode.playbackRate.value = parseFloat(speedSlider.value);
        currentSourceNode.detune.value = parseInt(pitchSlider.value);

        // Define o tempo de início e o offset para o rastreamento do tempo
        currentSourceNode._startTime = audioContext.currentTime;
        currentSourceNode._seekOffset = newTime;

        currentSourceNode.start(0, newTime); // Inicia do novo tempo
        
        isPlayingWithWebAudio = true; // Garante que a flag esteja correta
        
        // Re-atribuir o handler onended
        currentSourceNode.onended = () => {
            if (!isLooping) {
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
                if (loopPoints.start !== null && loopPoints.end !== null) {
                    currentSourceNode.stop();
                    currentSourceNode.disconnect();

                    currentSourceNode = audioContext.createBufferSource();
                    currentSourceNode.buffer = audioData.audioBuffer;
                    currentSourceNode.connect(currentGainNode);
                    currentGainNode.connect(audioContext.destination);

                    currentSourceNode.playbackRate.value = parseFloat(speedSlider.value);
                    currentSourceNode.detune.value = parseInt(pitchSlider.value);
                    
                    currentSourceNode._startTime = audioContext.currentTime;
                    currentSourceNode._seekOffset = loopPoints.start;

                    currentSourceNode.start(0, loopPoints.start);
                    currentSourceNode.onended = this;
                }
            }
        };
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
        activateLoop(); // Garante que o loop é ativado com os novos pontos
    }
});

// --- Delegação de Eventos para Células ---
document.getElementById('cellGrid').addEventListener('click', function(event) {
    const target = event.target;
    const cellElement = target.closest('.cell'); 
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);
        playAudio(cellNumber);
    }
});
