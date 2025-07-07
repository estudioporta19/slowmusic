// js/app.js

let currentAudio = null;
let audioFiles = {}; // Guarda { cellNumber: fileURL }
let currentCell = null; // Guarda o número da célula ativa
let loopPoints = { start: null, end: null };
let isLooping = false;
const audioPlayer = document.getElementById('audioPlayer');
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
const totalCells = 20;

let isDraggingLoopHandle = false;
let activeLoopHandle = null; // 'start' or 'end'

// Criar as células dinamicamente
function createCells() {
    const grid = document.getElementById('cellGrid');
    grid.innerHTML = ''; // Limpar células existentes
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

// Acionar o input de ficheiro global
globalUploadBtn.addEventListener('click', () => {
    globalFileInput.click();
});

// Lidar com o upload de múltiplos ficheiros
globalFileInput.addEventListener('change', (event) => {
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

        const fileURL = URL.createObjectURL(file);
        audioFiles[cellIndex] = fileURL;
        
        const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');
        document.getElementById(`fileName${cellIndex}`).textContent = fileNameWithoutExtension || file.name;
        
        filesLoaded++;
        cellIndex++;
    }
    globalUploadStatus.textContent = `${filesLoaded} ficheiro(s) carregado(s) com sucesso.`;
    if (filesLoaded === 0 && files.length > 0) {
        globalUploadStatus.textContent = 'Nenhum ficheiro de áudio válido carregado.';
    }
    event.target.value = '';
});

// Função para limpar todas as células
function clearAllCells() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        currentCell = null;
        clearLoop();
        progressFill.style.width = '0%';
        document.getElementById('currentTime').textContent = '0:00';
        document.getElementById('totalTime').textContent = '0:00';
    }

    for (let i = 1; i <= totalCells; i++) {
        if (audioFiles[i]) {
            URL.revokeObjectURL(audioFiles[i]);
        }
        delete audioFiles[i];
        document.getElementById(`fileName${i}`).textContent = 'Vazia';
        const cell = document.querySelector(`.cell[data-cell-number="${i}"]`);
        if (cell) cell.classList.remove('active');
    }
    globalUploadStatus.textContent = 'Células limpas.';
}

// Event listener para o botão de limpar células
clearCellsBtn.addEventListener('click', clearAllCells);


// Funções de reprodução de áudio
function playAudio(cellNumber) {
    const newAudioSrc = audioFiles[cellNumber];

    if (!newAudioSrc) {
        console.warn(`Nenhum ficheiro de áudio na célula ${cellNumber}.`);
        return;
    }

    if (currentAudio && currentAudio.src === newAudioSrc) {
        if (currentAudio.paused) {
            currentAudio.play().catch(error => { console.error("Erro ao reproduzir:", error); });
        } else {
            currentAudio.pause();
        }
        return;
    }

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentCell) {
            document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
        }
    }

    clearLoop(); // Limpar loop ao trocar de ficheiro

    audioPlayer.src = newAudioSrc;
    audioPlayer.load();
    audioPlayer.play().catch(error => { console.error("Erro ao iniciar reprodução:", error); });
    currentAudio = audioPlayer;
    currentCell = cellNumber;
    
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');
    
    const speed = speedSlider.value;
    audioPlayer.playbackRate = parseFloat(speed);
}

// Função para aplicar a velocidade
function applySpeed(speed) {
    speedSlider.value = speed;
    speedValue.textContent = speed.toFixed(2) + 'x';
    if (currentAudio) {
        currentAudio.playbackRate = speed;
    }
}

// Event listeners para os botões de preset
speedPreset05.addEventListener('click', () => {
    applySpeed(0.5);
    speedSlider.blur();
});

speedPreset10.addEventListener('click', () => {
    applySpeed(1.0);
    speedSlider.blur();
});

// Controle de velocidade
speedSlider.addEventListener('input', function(e) {
    const speed = parseFloat(e.target.value);
    speedValue.textContent = speed.toFixed(2) + 'x';
    if (currentAudio) {
        currentAudio.playbackRate = speed;
    }
});

speedSlider.addEventListener('mouseup', function() {
    this.blur();
});
speedSlider.addEventListener('touchend', function() {
    this.blur();
});

// Atalhos do teclado
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
        return;
    }

    if (!currentAudio) return;

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
            if (currentAudio) {
                if (currentAudio.paused) {
                    currentAudio.play().catch(error => { console.error("Erro ao reproduzir:", error); });
                } else {
                    currentAudio.pause();
                }
            }
            break;
    }
});

function setLoopPoint(point) {
    if (!currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) return;
    
    const currentTime = currentAudio.currentTime;
    
    // Ajustar o ponto para não ir além da duração total
    const adjustedTime = Math.min(Math.max(0, currentTime), currentAudio.duration);
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
    if (!currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) {
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
        return;
    }
    
    const duration = currentAudio.duration;
    
    if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
        const startPercent = (loopPoints.start / duration) * 100;
        const endPercent = (loopPoints.end / duration) * 100;
        
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = (endPercent - startPercent) + '%';
        loopMarkers.classList.add('active');
        loopMarkers.style.display = 'block';
        loopMarkers.style.background = 'rgba(255, 255, 0, 0.2)'; // Fundo normal para loop completo

        // Posicionar handles A e B
        loopHandleA.style.left = (loopPoints.start / duration) * 100 + '%';
        loopHandleB.style.left = (loopPoints.end / duration) * 100 + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'block';

    } else if (loopPoints.start !== null) {
        // Apenas ponto A definido
        const startPercent = (loopPoints.start / duration) * 100;
        
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = '2px';
        loopMarkers.classList.add('active');
        loopMarkers.style.display = 'block';
        loopMarkers.style.background = 'transparent'; // Fundo transparente quando é apenas o ponto A
        
        // Posicionar apenas handle A, esconder B
        loopHandleA.style.left = startPercent + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'none';

    } else {
        // Nenhum ponto definido
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
    }
}

// Lógica de arraste dos marcadores
progressBar.addEventListener('mousedown', (e) => {
    if (!currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) return;

    // Verificar se o clique foi num dos handles
    if (e.target === loopHandleA) {
        isDraggingLoopHandle = true;
        activeLoopHandle = 'start';
    } else if (e.target === loopHandleB) {
        isDraggingLoopHandle = true;
        activeLoopHandle = 'end';
    } else {
        // Se o clique não foi nos handles, comporta-se como um clique normal na barra
        // Agora, apenas muda o tempo de reprodução, sem limpar o loop!
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * currentAudio.duration;
        currentAudio.currentTime = newTime;
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingLoopHandle || !currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) return;

    e.preventDefault(); // Prevenir seleção de texto ou outros comportamentos padrão

    const rect = progressBar.getBoundingClientRect();
    let newX = e.clientX - rect.left;

    // Clamp newX to be within the bounds of the progress bar
    newX = Math.max(0, Math.min(newX, rect.width));

    const percentage = newX / rect.width;
    const newTime = percentage * currentAudio.duration;

    if (activeLoopHandle === 'start') {
        loopPoints.start = newTime;
        // Se o ponto B existe, garantir que A não ultrapasse B
        if (loopPoints.end !== null && loopPoints.start > loopPoints.end) {
            loopPoints.start = loopPoints.end; // Acompanha B
        }
        document.getElementById('pointA').textContent = formatTime(loopPoints.start);
    } else if (activeLoopHandle === 'end') {
        loopPoints.end = newTime;
        // Se o ponto A existe, garantir que B não seja menor que A
        if (loopPoints.start !== null && loopPoints.end < loopPoints.start) {
            loopPoints.end = loopPoints.start; // Acompanha A
        }
        document.getElementById('pointB').textContent = formatTime(loopPoints.end);
    }

    // Ativar/atualizar loop imediatamente durante o arraste para feedback visual
    activateLoop(); // Esta função já cuida da ordem dos pontos
    updateLoopMarkers(); // Atualiza a posição visual dos marcadores
});

document.addEventListener('mouseup', () => {
    if (isDraggingLoopHandle) {
        isDraggingLoopHandle = false;
        activeLoopHandle = null;
        // Assegurar que o loop é ativado corretamente após o arraste
        activateLoop();
    }
});


// Atualizar barra de progresso
audioPlayer.addEventListener('timeupdate', function() {
    if (audioPlayer.duration && !isNaN(audioPlayer.duration) && !isDraggingLoopHandle) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFill.style.width = progress + '%';
        
        document.getElementById('currentTime').textContent = formatTime(audioPlayer.currentTime);
        document.getElementById('totalTime').textContent = formatTime(audioPlayer.duration);
        
        // Verificar loop
        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            if (audioPlayer.currentTime >= loopPoints.end) {
                audioPlayer.currentTime = loopPoints.start;
            }
        }
    }
});

// Carregar metadata do áudio
audioPlayer.addEventListener('loadedmetadata', function() {
    updateLoopMarkers();
    document.getElementById('totalTime').textContent = formatTime(audioPlayer.duration);
});

// Quando o áudio termina
audioPlayer.addEventListener('ended', function() {
    if (currentCell) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }
    currentAudio = null;
    currentCell = null;
    clearLoop(); // O loop é limpo quando a música termina
    progressFill.style.width = '0%';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';
});

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Delegação de eventos para as células (agora elas são clicáveis)
document.getElementById('cellGrid').addEventListener('click', function(event) {
    const target = event.target;
    const cellElement = target.closest('.cell'); 
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);
        playAudio(cellNumber);
    }
});

// Inicializar a aplicação
createCells();
updateLoopDisplay();
applySpeed(parseFloat(speedSlider.value));
updateLoopMarkers(); // Chama no início para garantir que os handles estejam ocultos se não houver áudio.
