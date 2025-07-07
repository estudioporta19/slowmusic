// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, toneBuffer: Tone.Buffer, fileName: string, player: Tone.Player, pitchShift: Tone.PitchShift, lastPlaybackTime: number } }
let currentCell = null; // Guarda o número da célula ativa

let loopPoints = { start: null, end: null };
let isLooping = false;

// Flag para saber se estamos a tocar
let isPlaying = false; 

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
    // Adiciona event listeners para iniciar o Tone.js com a primeira interação do utilizador.
    // Isso é crucial para as políticas de autoplay dos navegadores.
    document.documentElement.addEventListener('mousedown', () => {
        if (Tone.context.state !== 'running') {
            Tone.start().then(() => {
                console.log('Tone.js context resumed from user gesture (mousedown).');
            }).catch(e => console.error("Failed to start Tone.js context:", e));
        }
    }, { once: true }); 

    document.documentElement.addEventListener('keydown', (e) => {
        if (Tone.context.state !== 'running') {
            Tone.start().then(() => {
                console.log('Tone.js context resumed from user gesture (keydown).');
            }).catch(e => console.error("Failed to start Tone.js context:", e));
        }
    }, { once: true }); 

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
                URL.revokeObjectURL(audioFiles[i].fileURL); // Libera o URL do ficheiro
            }
            if (audioFiles[i].player) {
                // Muito importante: Dispose do player para libertar recursos de áudio
                audioFiles[i].player.dispose(); 
            }
            if (audioFiles[i].pitchShift) { // Dispor do nó PitchShift
                audioFiles[i].pitchShift.dispose();
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
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';
    progressFill.style.width = '0%'; 
    clearLoop(); // Assegura que o loop é limpo também
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
    clearAllCells(); // Limpa as células antes de carregar novos ficheiros

    let filesLoaded = 0;
    let cellIndex = 1;

    for (let i = 0; i < files.length && cellIndex <= totalCells; i++) {
        const file = files[i];

        if (!file.type.startsWith('audio/')) {
            console.warn(`Ficheiro "${file.name}" não é um ficheiro de áudio. Ignorando.`);
            continue;
        }

        try {
            const fileURL = URL.createObjectURL(file);
            const toneBuffer = await Tone.Buffer.fromUrl(fileURL);
            
            const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');

            // Criar um nó PitchShift e um Player para reprodução limpa
            const pitchShift = new Tone.PitchShift().toDestination();
            const player = new Tone.Player(toneBuffer).connect(pitchShift);
            
            player.loop = false; 
            // LoopStart e loopEnd são controlados pela lógica de loop, não diretamente no player aqui
            
            // Adicionar um listener para o fim da reprodução quando não estiver em loop
            player.onEnded = () => {
                if (!isLooping && isPlaying && currentCell && audioFiles[currentCell] && audioFiles[currentCell].player === player) {
                    // Esta verificação é crucial para garantir que é o player correto a terminar
                    console.log(`Playback ended for cell ${currentCell}.`);
                    stopCurrentAudio();
                    if (currentCell) {
                        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
                    }
                    currentCell = null;
                    clearLoop(); 
                }
            };

            audioFiles[cellIndex] = {
                fileURL: fileURL, 
                toneBuffer: toneBuffer,
                fileName: fileNameWithoutExtension || file.name,
                player: player,
                pitchShift: pitchShift, // Armazenar a instância do PitchShift
                lastPlaybackTime: 0 
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
    event.target.value = ''; // Limpa a seleção do input de ficheiro
});

clearCellsBtn.addEventListener('click', clearAllCells);

// Para a reprodução atual, limpa estados
function stopCurrentAudio() {
    if (currentCell !== null && audioFiles[currentCell] && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.stop(); 
        audioFiles[currentCell].lastPlaybackTime = 0; 
    }
    isPlaying = false;
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
    progressFill.style.width = '0%'; 
    document.getElementById('currentTime').textContent = '0:00'; 
}

// Função para iniciar a reprodução com Tone.js
async function playAudio(cellNumber, startOffset = 0) {
    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.player || !audioData.toneBuffer.loaded) {
        console.warn(`Nenhum áudio carregado ou pronto na célula ${cellNumber}.`);
        return;
    }

    // Parar qualquer áudio *anteriormente ativo* se estiver a mudar de célula ou a reiniciar.
    if (currentCell !== cellNumber || isPlaying) {
        stopCurrentAudio(); 
    }

    // Desativar célula ativa anterior, se houver
    if (currentCell && document.querySelector(`.cell[data-cell-number="${currentCell}"]`)) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }

    // Atualizar célula ativa
    currentCell = cellNumber;
    document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.add('active');

    // Se a nova célula é diferente da última vez que uma faixa foi tocada, limpa o loop.
    if (audioData._lastPlayedCell !== cellNumber) {
        clearLoop(); 
        audioData._lastPlayedCell = cellNumber; // Marca esta célula como a última a ser reproduzida
    }

    const player = audioData.player;
    const pitchShift = audioData.pitchShift;

    // Aplicar velocidade e pitch
    player.playbackRate = parseFloat(speedSlider.value);
    
    // Calcular a correção de pitch necessária devido à mudança de velocidade do Player
    // Tone.Player.playbackRate altera o pitch. Precisamos compensar isso.
    // A mudança de pitch é log2(playbackRate) oitavas. 1 oitava = 12 semitons.
    const speedPitchCorrection = -(Math.log2(player.playbackRate) * 12);
    
    // Aplicar o pitch definido pelo utilizador (em semitons) MAIS a correção de velocidade
    const userPitchInSemis = parseInt(pitchSlider.value) / 100;
    pitchShift.pitch = userPitchInSemis + speedPitchCorrection;

    document.getElementById('totalTime').textContent = formatTime(player.buffer.duration);

    // Configurar o loop no player
    if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
        player.loop = true;
        player.loopStart = loopPoints.start;
        player.loopEnd = loopPoints.end;
        if (startOffset < loopPoints.start || startOffset >= loopPoints.end) {
            startOffset = loopPoints.start; // Começa no início do loop se o offset estiver fora
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
        progressUpdateInterval = null;
    }
    progressUpdateInterval = setInterval(() => {
        if (!isPlaying || !player || !audioData.toneBuffer.loaded) {
            clearInterval(progressUpdateInterval);
            progressUpdateInterval = null;
            return;
        }

        let currentTime = player.toSeconds(player.immediate()); 
        const duration = player.buffer.duration;

        let progress;
        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            const loopDuration = loopPoints.end - loopPoints.start;
            const currentOffsetInLoop = (currentTime - loopPoints.start) % loopDuration;
            currentTime = loopPoints.start + currentOffsetInLoop; 
            progress = ((currentTime - loopPoints.start) / loopDuration) * 100;
        } else {
            progress = (currentTime / duration) * 100;
        }

        progress = Math.min(100, Math.max(0, progress)); 
        currentTime = Math.min(duration, Math.max(0, currentTime)); 

        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(currentTime);
        document.getElementById('totalTime').textContent = formatTime(duration);
    }, 100); 
}


// --- Controles de Velocidade e Pitch ---
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].player) {
        const player = audioFiles[currentCell].player;
        const pitchShift = audioFiles[currentCell].pitchShift; // Aceder ao nó PitchShift

        // Aplica a nova velocidade *diretamente* ao player ativo
        player.playbackRate = newSpeed; 

        // Calcular a correção de pitch necessária devido à mudança de velocidade do Player
        // A mudança de pitch é log2(newSpeed) oitavas. 1 oitava = 12 semitons.
        const speedPitchCorrection = -(Math.log2(newSpeed) * 12);
        
        // Aplicar o pitch definido pelo utilizador (em semitons) MAIS a correção de velocidade
        const userPitchInSemis = parseInt(pitchSlider.value) / 100;
        pitchShift.pitch = userPitchInSemis + speedPitchCorrection;
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitch = parseInt(e.target.value);
    applyPitchToDisplay(newPitch); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].pitchShift) { // Aceder ao pitchShift
        const player = audioFiles[currentCell].player;
        const pitchShift = audioFiles[currentCell].pitchShift;

        // Calcular a correção de pitch necessária devido à velocidade atual do Player
        const speedPitchCorrection = -(Math.log2(player.playbackRate) * 12);

        // Aplica o novo pitch *diretamente* ao nó PitchShift ativo, somando a correção de velocidade
        pitchShift.pitch = (newPitch / 100) + speedPitchCorrection; // Converter cents para semitons e adicionar correção
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
            e.preventDefault(); 
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
        audioData.lastPlaybackTime = player.toSeconds(player.immediate()); 
        player.stop();
        isPlaying = false;
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    } else {
        const resumeTime = audioData.lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioData.lastPlaybackTime = 0; 
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!isPlaying || !currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].player) return;
    
    const player = audioFiles[currentCell].player;
    let currentTime = player.toSeconds(player.immediate()); 
    
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
            const player = audioFiles[currentCell].player;
            player.loop = true;
            player.loopStart = loopPoints.start;
            player.loopEnd = loopPoints.end;
            
            // Se a posição atual estiver fora do novo loop, reposiciona.
            const currentPlayerTime = player.toSeconds(player.immediate());
            if (currentPlayerTime < loopPoints.start || currentPlayerTime >= loopPoints.end) {
                player.stop(); 
                player.start(0, loopPoints.start); 
            }
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
        const player = audioFiles[currentCell].player;
        player.loop = false;
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

        loopHandleA.style.left = startPercent + '%';
        loopHandleB.style.left = endPercent + '%';
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
        
        if (isPlaying && currentCell && audioFiles[currentCell].player) {
            const player = audioFiles[currentCell].player;
            player.stop(); 
            player.start(0, newTime); 
            isPlaying = true; 
        } else if (currentCell) { 
            playAudio(currentCell, newTime); 
        }
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
        
        if (currentCell === cellNumber) { 
            togglePlayPause(); 
        } else { 
            playAudio(cellNumber); 
        }
    }
});
