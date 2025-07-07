// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, toneBuffer: Tone.Buffer, fileName: string, player: Tone.GrainPlayer, lastPlaybackTime: number } }
let currentCell = null; // Guarda o número da célula ativa

let loopPoints = { start: null, end: null };
let isLooping = false;

// Tone.js Context - Tone.js gerencia o AudioContext internamente
// Tone.start() ativa o contexto de áudio (requer interação do utilizador)
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
    // Tone.js só é iniciado após a primeira interação do utilizador
    // Não precisamos de Tone.Context.resume() aqui.
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
        if (audioFiles[i]) {
            if (audioFiles[i].fileURL) {
                URL.revokeObjectURL(audioFiles[i].fileURL);
            }
            if (audioFiles[i].player) {
                audioFiles[i].player.dispose(); // Libera os recursos do Tone.GrainPlayer
            }
            if (audioFiles[i].toneBuffer) {
                audioFiles[i].toneBuffer.dispose(); // Libera o buffer de áudio
            }
        }
        delete audioFiles[i]; 
        document.getElementById(`fileName${i}`).textContent = 'Vazia';
        const cell = document.querySelector(`.cell[data-cell-number="${i}"]`);
        if (cell) cell.classList.remove('active');
    }
    globalUploadStatus.textContent = 'Células limpas.';
}

// --- Lógica de Carregamento e Reprodução de Áudio (Tone.js) ---

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
            // Tone.Buffer.fromUrl carrega e decodifica o áudio
            // Precisamos criar um URL para o ficheiro local
            const fileURL = URL.createObjectURL(file);
            const toneBuffer = await Tone.Buffer.fromUrl(fileURL);
            
            const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');

            // Cria um GrainPlayer para cada buffer carregado
            const player = new Tone.GrainPlayer(toneBuffer).toDestination();
            player.loop = false; // Gerenciamos o loop manualmente por enquanto
            
            audioFiles[cellIndex] = {
                fileURL: fileURL, // Guarda o URL para revogar depois
                toneBuffer: toneBuffer,
                fileName: fileNameWithoutExtension || file.name,
                player: player,
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

// Para a reprodução atual, limpa estados
function stopCurrentAudio() {
    if (currentCell !== null && audioFiles[currentCell] && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.stop(); // Para o player ativo
    }
    isPlaying = false;
    // Limpa o intervalo de atualização da barra de progresso
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
}

// Função para iniciar a reprodução com Tone.js
async function playAudio(cellNumber, startOffset = 0) {
    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.player || !audioData.toneBuffer.loaded) {
        console.warn(`Nenhum áudio carregado ou pronto na célula ${cellNumber}.`);
        return;
    }

    // Ativar o contexto de áudio se ainda não estiver ativo (requer interação do utilizador)
    if (Tone.context.state !== 'running') {
        await Tone.start();
        console.log('Tone.js context started!');
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
    if (audioData.lastCellId !== currentCell) { 
        clearLoop();
    }
    audioData.lastCellId = currentCell; 

    // --- Configurar e Iniciar Tone.GrainPlayer ---
    const player = audioData.player;

    // Aplicar velocidade e pitch aos parâmetros do player
    const currentSpeed = parseFloat(speedSlider.value);
    const currentPitchCents = parseInt(pitchSlider.value);

    player.playbackRate = currentSpeed;
    player.detune = currentPitchCents; // detune em cents

    // Ajustar a duração total exibida
    document.getElementById('totalTime').textContent = formatTime(player.buffer.duration);

    // Configurar o loop no player (Tone.js lida com isso)
    if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
        player.loop = true;
        player.loopStart = loopPoints.start;
        player.loopEnd = loopPoints.end;
        // Se estamos a iniciar no meio de um loop, o startOffset já deve ser o loopPoint.start
        if (startOffset < loopPoints.start || startOffset > loopPoints.end) {
            startOffset = loopPoints.start;
        }
    } else {
        player.loop = false;
    }

    // Iniciar o player
    player.start(0, startOffset); 
    isPlaying = true;

    // Inicia ou reinicia o intervalo de atualização da barra de progresso
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
        if (!isPlaying || !player || !audioData.toneBuffer.loaded) {
            clearInterval(progressUpdateInterval);
            progressUpdateInterval = null;
            return;
        }

        let currentTime = player.toSeconds(player.immediate()); // Tempo de reprodução atual do player
        const duration = player.buffer.duration;

        let progress;
        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            // Se estiver em loop, o progresso é dentro do segmento de loop
            const loopDuration = loopPoints.end - loopPoints.start;
            const currentOffsetInLoop = (currentTime - loopPoints.start) % loopDuration;
            currentTime = loopPoints.start + currentOffsetInLoop; // Ajusta o tempo exibido para o loop
            progress = ((currentTime - loopPoints.start) / loopDuration) * 100;
        } else {
            progress = (currentTime / duration) * 100;
        }

        progress = Math.min(100, Math.max(0, progress)); // Limita o progresso entre 0 e 100
        currentTime = Math.min(duration, Math.max(0, currentTime)); // Limita o tempo

        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(currentTime);
        document.getElementById('totalTime').textContent = formatTime(duration);

        // Verificação manual de fim de faixa para não-loop
        if (!isLooping && currentTime >= duration - 0.05) { // Margem de erro
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

    }, 100);
}


// --- Controles de Velocidade e Pitch ---
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.playbackRate = newSpeed; // Aplica em tempo real
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitch = parseInt(e.target.value);
    applyPitchToDisplay(newPitch); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.detune = newPitch; // Aplica em tempo real (em cents)
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

    // Se nenhuma célula carregada, não faz nada
    if (!currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer.loaded) return; 

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
    if (!currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer.loaded) {
        console.warn("Nenhum áudio selecionado ou carregado para reproduzir/pausar.");
        return;
    }

    const audioData = audioFiles[currentCell];
    const player = audioData.player;

    if (isPlaying) {
        // Pausar: Guarda o tempo atual e para o áudio
        audioData.lastPlaybackTime = player.toSeconds(player.immediate());
        player.stop();
        isPlaying = false;
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    } else {
        // Reproduzir: Inicia do último tempo de pausa ou do início
        const resumeTime = audioData.lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioData.lastPlaybackTime = 0; // Limpa após retomar
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!isPlaying || !currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].player) return;
    
    const player = audioFiles[currentCell].player;
    let currentTime = player.toSeconds(player.immediate()); // Tempo atual do Tone.GrainPlayer
    
    const duration = player.buffer.duration;
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
        // Aplica o loop no player se estiver a tocar
        if (isPlaying && currentCell && audioFiles[currentCell].player) {
            audioFiles[currentCell].player.loop = true;
            audioFiles[currentCell].player.loopStart = loopPoints.start;
            audioFiles[currentCell].player.loopEnd = loopPoints.end;
        }
        updateLoopDisplay();
        updateLoopMarkers();
    }
}

function clearLoop() {
    loopPoints.start = null;
    loopPoints.end = null;
    isLooping = false;
    // Remove o loop do player se estiver a tocar
    if (currentCell && audioFiles[currentCell] && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.loop = false;
    }
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
    if (!audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer || !audioFiles[currentCell].toneBuffer.loaded) {
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
        return;
    }
    
    const duration = audioFiles[currentCell].toneBuffer.duration;
    
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
    if (!audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer || !audioFiles[currentCell].toneBuffer.loaded) return;

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
        const newTime = percentage * audioFiles[currentCell].toneBuffer.duration;
        
        playAudio(currentCell, newTime); // Inicia do novo tempo
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingLoopHandle || !audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer || !audioFiles[currentCell].toneBuffer.loaded) return;

    e.preventDefault();

    const rect = progressBar.getBoundingClientRect();
    let newX = e.clientX - rect.left;
    newX = Math.max(0, Math.min(newX, rect.width));

    const percentage = newX / rect.width;
    const newTime = percentage * audioFiles[currentCell].toneBuffer.duration;

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
