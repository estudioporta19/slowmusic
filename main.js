// JavaScript
let currentAudioBuffer = null;
let sourceNode = null;
let audioContext = null;
let currentCell = null;
let lastPlaybackTime = 0; // Armazena o tempo no áudio em que a reprodução parou/pausou
let isCurrentlyPlaying = false; // Novo estado para controlar se está a tocar ativamente

let loopPoints = { start: null, end: null };
let isLooping = false;

const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const loopMarkers = document.getElementById('loopMarkers');
const globalFileInput = document.getElementById('globalFileInput');
const globalUploadBtn = document.getElementById('globalUploadBtn');
const globalUploadStatus = document.getElementById('globalUploadStatus');
const speedSlider = document.getElementById('speedSlider');
const speedValueSpan = document.getElementById('speedValue');
const presetHalfSpeedBtn = document.getElementById('presetHalfSpeedBtn');
const presetNormalSpeedBtn = document.getElementById('presetNormalSpeedBtn');
const clearAllCellsBtn = document.getElementById('clearAllCellsBtn');

const pitchInput = document.getElementById('pitchInput');
const pitchValueSpan = document.getElementById('pitchValue');
const increasePitchBtn = document.getElementById('increasePitchBtn');
const decreasePitchBtn = document.getElementById('decreasePitchBtn');
const resetPitchBtn = document.getElementById('resetPitchBtn');

const currentBPMDisplay = document.getElementById('currentBPM');

const totalCells = 20;

let cellAudioData = {};

let bpmUpdateInterval = null;

// Função para inicializar AudioContext
// Garantimos que só é chamada após a primeira interação do utilizador
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Desconecta o evento uma vez que o contexto foi inicializado
        document.body.removeEventListener('click', initAudioContext, { once: true });
        console.log('AudioContext inicializado após a interação do utilizador.');
    }
}

// Criar as células dinamicamente
function createCells() {
    const grid = document.getElementById('cellGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-cell-number', i);
        cell.innerHTML = `<div class="file-name" id="fileName${i}">Nenhum ficheiro carregado</div>`;
        grid.appendChild(cell);
    }
}

globalUploadBtn.addEventListener('click', () => {
    initAudioContext();
    globalFileInput.click();
    globalUploadBtn.blur();
});

globalFileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files.length === 0) {
        globalUploadStatus.textContent = 'Nenhum ficheiro selecionado.';
        return;
    }

    globalUploadStatus.textContent = `A carregar ${files.length} ficheiro(s)...`;

    clearAllCells(false);

    let filesLoaded = 0;
    let cellIndex = 1;

    for (let i = 0; i < files.length && cellIndex <= totalCells; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/')) {
            console.warn(`Ficheiro "${file.name}" não é um ficheiro de áudio. Ignorando.`);
            continue;
        }

        try {
            // Garante que o AudioContext está pronto para decodificar
            if (!audioContext) {
                initAudioContext();
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
           
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            cellAudioData[cellIndex] = { audioBuffer: audioBuffer, bpm: null, fileName: file.name };

            document.getElementById(`fileName${cellIndex}`).textContent = file.name;
            document.querySelector(`.cell[data-cell-number="${cellIndex}"]`).classList.add('has-file');

            filesLoaded++;

            // Chamar a deteção de BPM
            detectBPMForCell(cellIndex, file);

        } catch (error) {
            console.error(`Erro ao carregar ou decodificar ficheiro "${file.name}":`, error);
            globalUploadStatus.textContent = `Erro ao carregar ficheiro: ${file.name}. Verifique a consola para mais detalhes.`;
        }
        cellIndex++;
    }
    if (filesLoaded > 0) {
        globalUploadStatus.textContent = `${filesLoaded} ficheiro(s) carregado(s) com sucesso.`;
    } else {
        globalUploadStatus.textContent = 'Nenhum ficheiro de áudio válido foi carregado.';
    }
    event.target.value = '';
});

async function detectBPMForCell(cellNumber, file) {
    if (typeof DetectBPM !== 'function') {
        console.warn('DetectBPM library (the detection function) not found. Cannot detect BPM.');
        cellAudioData[cellNumber].bpm = null;
        if (currentCell === cellNumber) {
            currentBPMDisplay.textContent = '--';
        }
        return;
    }

    console.log(`A iniciar deteção de BPM para célula ${cellNumber} (${file.name})...`);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const bpm = await DetectBPM(audioBuffer);

        cellAudioData[cellNumber].bpm = bpm.toFixed(2);
        console.log(`BPM detetado para célula ${cellNumber} (${file.name}): ${bpm.toFixed(2)}`);

        if (currentCell === cellNumber) {
            currentBPMDisplay.textContent = bpm.toFixed(2);
        }
    } catch (error) {
        console.warn(`Não foi possível detetar BPM para o ficheiro ${file.name}: ${error.message}`, error);
        cellAudioData[cellNumber].bpm = null;
        if (currentCell === cellNumber) {
            currentBPMDisplay.textContent = '--';
        }
    }
}

function clearAllCells(resetStatus = true) {
    stopCurrentAudio(true); // Passar 'true' para limpar completamente
    clearLoop();
    resetPitch();

    cellAudioData = {};
    currentBPMDisplay.textContent = '--';

    document.querySelectorAll('.cell').forEach(cell => {
        const cellNumber = parseInt(cell.dataset.cellNumber);
        document.getElementById(`fileName${cellNumber}`).textContent = 'Nenhum ficheiro carregado';
        cell.classList.remove('active', 'has-file');
    });

    if (resetStatus) {
        globalUploadStatus.textContent = 'Todas as células limpas.';
    }
}

clearAllCellsBtn.addEventListener('click', () => {
    clearAllCells(true);
    clearAllCellsBtn.blur();
});

// Adicionada flag `fullStop` para controlar se `currentAudioBuffer` é limpo
function stopCurrentAudio(fullStop = false) {
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null;
    }
    
    isCurrentlyPlaying = false; // Atualiza o estado de reprodução

    if (fullStop) {
        currentAudioBuffer = null;
        currentCell = null; // Também deve ser nulo se não houver faixa selecionada
        lastPlaybackTime = 0; // Se for uma parada total, começa do zero
    } 
    
    progressFill.style.width = '0%';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';
    pauseProgressUpdate();
    stopBPMUpdate();
    currentBPMDisplay.textContent = '--';

    // Desativar a célula visualmente se for uma parada completa ou se acabou de pausar
    if (fullStop || (currentCell !== null && !isCurrentlyPlaying)) { 
        document.querySelectorAll('.cell.active').forEach(cell => cell.classList.remove('active'));
    }
}

async function playAudio(cellNumber, startTime = 0) {
    initAudioContext(); // Garante que o contexto está inicializado
    
    // Sempre tenta retomar o AudioContext antes de qualquer reprodução
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("AudioContext resumed for playback.");
        } catch (e) {
            console.error("Erro ao retomar AudioContext para playAudio:", e);
            return; // Não prossegue se não conseguir retomar o contexto
        }
    }
    playAudioInternal(cellNumber, startTime);
}

function playAudioInternal(cellNumber, startTime = 0) {
    const cellData = cellAudioData[cellNumber];
    if (!cellData || !cellData.audioBuffer) {
        console.warn(`Nenhum AudioBuffer na célula ${cellNumber}.`);
        stopCurrentAudio(true); // Parada completa e limpa UI
        return;
    }
    const audioBuffer = cellData.audioBuffer;

    // Lógica para PAUSAR se a mesma célula estiver a tocar e não for um salto de tempo
    // Um startTime diferente de lastPlaybackTime OU currentCell diferente significa um "salto" ou nova seleção.
    // Nestes casos, queremos REINICIAR. Apenas pausamos se for o MESMO ponto.
    if (currentCell === cellNumber && isCurrentlyPlaying && startTime === lastPlaybackTime) {
        pausePlayback();
        return;
    }
    
    // Se chegamos aqui, é porque:
    // 1. É uma nova célula.
    // 2. É a mesma célula, mas estava pausada/parada.
    // 3. É a mesma célula e estava a tocar, mas é um "salto" (startTime mudou).

    // PARAR o áudio atual completamente antes de iniciar o novo
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null;
    }

    // Definir o currentAudioBuffer e currentCell para a faixa que será reproduzida
    currentAudioBuffer = audioBuffer;
    currentCell = cellNumber;
    lastPlaybackTime = startTime; // Sempre define o lastPlaybackTime para o startTime desejado

    currentBPMDisplay.textContent = cellData.bpm !== null ? cellData.bpm : '--';

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = currentAudioBuffer;
    sourceNode.connect(audioContext.destination);

    sourceNode.playbackRate.value = parseFloat(speedSlider.value);
    sourceNode.detune.value = parseInt(pitchInput.value) * 100;

    sourceNode.onended = () => {
        if (!isLooping) {
            handleAudioEnded(); // Chamar a função para lidar com o fim do áudio
        }
    };

    sourceNode.start(0, lastPlaybackTime); // Começa do novo offset ou do tempo clicado
    audioStartTimeContext = audioContext.currentTime; // Reinicia o tempo de contexto
    audioOffsetPlayback = lastPlaybackTime; // Reinicia o offset de reprodução

    document.getElementById('totalTime').textContent = formatTime(currentAudioBuffer.duration);

    // Gerir a classe 'active' da célula
    document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active'));
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');
    
    isCurrentlyPlaying = true; // Atualiza o estado para "a tocar"

    startProgressUpdate(); 
    startBPMUpdateInterval();
}

function pausePlayback() {
    if (sourceNode && audioContext.state === 'running' && isCurrentlyPlaying) { // Verifica também isCurrentlyPlaying
        // Calcular o tempo atual da faixa antes de pausar
        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
        lastPlaybackTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);

        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null; 

        audioContext.suspend().then(() => {
            console.log('AudioContext suspended.');
        }).catch(e => console.error("Erro ao suspender AudioContext:", e));
        
        pauseProgressUpdate();
        stopBPMUpdate();
        isCurrentlyPlaying = false; 

        // Remover a classe 'active' da célula ao pausar
        if (currentCell) {
            document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
        }
    }
}

async function resumePlayback() {
    // Se não houver célula selecionada ou dados de áudio, não faz nada
    if (!currentCell || !cellAudioData[currentCell]) {
        console.warn("Nenhuma célula ou dados de áudio para retomar a reprodução.");
        return;
    }

    // Se já estiver a tocar, não faz nada
    if (isCurrentlyPlaying) {
        console.log("Áudio já está a tocar, não é necessário retomar.");
        return;
    }

    // Tenta retomar o AudioContext
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("AudioContext resumed for resumePlayback.");
        } catch (e) {
            console.error("Erro ao retomar AudioContext para resumePlayback:", e);
            return;
        }
    }
    
    // Agora que o contexto está garantidamente 'running' (ou tentou ser retomado),
    // tenta reproduzir do lastPlaybackTime.
    if (currentAudioBuffer) { // Verifica se há um buffer carregado
        playAudioInternal(currentCell, lastPlaybackTime); 
    } else { 
        console.warn("AudioBuffer não está carregado para a célula atual durante resumePlayback.");
        stopCurrentAudio(true); // Limpa completamente o estado.
    }
}


let progressInterval = null;
let audioStartTimeContext = 0;
let audioOffsetPlayback = 0;

function startProgressUpdate() {
    if (progressInterval) clearInterval(progressInterval);

    // Garante que o AudioContext esteja em 'running' para que `currentTime` avance.
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed for progress update.");
        }).catch(e => console.error("Failed to resume AudioContext for progress update:", e));
    }

    audioStartTimeContext = audioContext.currentTime;
    audioOffsetPlayback = lastPlaybackTime; // Usa o lastPlaybackTime como ponto de partida

    progressInterval = setInterval(() => {
        // Adiciona isCurrentlyPlaying para parar a atualização se a reprodução parou
        if (!sourceNode || audioContext.state !== 'running' || !currentAudioBuffer || !isCurrentlyPlaying) {
            clearInterval(progressInterval);
            return;
        }

        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
        const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);

        if (!isNaN(currentAudioBuffer.duration)) {
            const progress = (currentTheoreticalTime / currentAudioBuffer.duration) * 100;
            progressFill.style.width = progress + '%';

            document.getElementById('currentTime').textContent = formatTime(currentTheoreticalTime);

            if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
                if (currentTheoreticalTime >= loopPoints.end) {
                    // Parar o nó atual para reiniciar o loop suavemente
                    if (sourceNode) {
                        sourceNode.stop();
                        sourceNode.disconnect();
                        sourceNode = null; 
                    }
                    playAudioInternal(currentCell, loopPoints.start); // Reinicia a reprodução do ponto A
                }
            } else if (currentTheoreticalTime >= currentAudioBuffer.duration) {
                // Certifica-se de que a barra de progresso atinge 100% no final
                progressFill.style.width = '100%';
                document.getElementById('currentTime').textContent = formatTime(currentAudioBuffer.duration);
                handleAudioEnded();
            }
        } else {
            document.getElementById('currentTime').textContent = '0:00';
            document.getElementById('totalTime').textContent = '0:00';
        }
    }, 100);
}

function pauseProgressUpdate() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function startBPMUpdateInterval() {
    stopBPMUpdate();

    if (!currentCell || !cellAudioData[currentCell] || cellAudioData[currentCell].bpm === null) {
        currentBPMDisplay.textContent = '--';
        return;
    }

    const baseBPM = parseFloat(cellAudioData[currentCell].bpm);
    const currentSpeed = parseFloat(speedSlider.value);
    const effectiveBPM = baseBPM * currentSpeed;

    const beatDurationSeconds = 60 / effectiveBPM;
    // O intervalo para atualizar o BPM no display deve ser constante e não baseado no beat,
    // apenas o cálculo do BPM efetivo usa a velocidade.
    // Um intervalo mais razoável seria 1 segundo para atualização do display.
    const updateIntervalMs = 1000; 

    currentBPMDisplay.textContent = effectiveBPM.toFixed(2);

    bpmUpdateInterval = setInterval(() => {
        if (currentCell && cellAudioData[currentCell] && cellAudioData[currentCell].bpm !== null) {
            const currentSpeedDuringUpdate = parseFloat(speedSlider.value);
            const updatedEffectiveBPM = parseFloat(cellAudioData[currentCell].bpm) * currentSpeedDuringUpdate;
            currentBPMDisplay.textContent = updatedEffectiveBPM.toFixed(2);
        } else {
            currentBPMDisplay.textContent = '--';
        }

        // Também para a atualização do BPM se não estiver a tocar
        if (!sourceNode || audioContext.state !== 'running' || !currentAudioBuffer || !isCurrentlyPlaying) {
            stopBPMUpdate();
            return;
        }
    }, updateIntervalMs); // Use um intervalo fixo para o display
}

function stopBPMUpdate() {
    if (bpmUpdateInterval) {
        clearInterval(bpmUpdateInterval);
        bpmUpdateInterval = null;
    }
}

speedSlider.addEventListener('input', function(e) {
    const speed = parseFloat(e.target.value);
    speedValueSpan.textContent = speed.toFixed(2) + 'x';
    
    // Apenas recalcula e reinicia se houver áudio e estiver a tocar
    if (currentCell && cellAudioData[currentCell] && currentAudioBuffer && isCurrentlyPlaying) {
        // Calcular o tempo exato para reiniciar
        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
        const currentTimeInAudio = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
        
        // Parar o nó existente para aplicar a nova velocidade recriando
        if (sourceNode) {
            sourceNode.stop();
            sourceNode.disconnect();
            sourceNode = null;
        }
        playAudioInternal(currentCell, currentTimeInAudio); // Reinicia a reprodução com a nova velocidade
    } else if (sourceNode) {
        // Se estiver pausado ou parado, mas com um sourceNode existente, apenas atualiza a propriedade playbackRate
        // A nova velocidade será efetivada quando a reprodução for retomada.
        sourceNode.playbackRate.value = speed;
    }


    if (currentCell && cellAudioData[currentCell] && cellAudioData[currentCell].bpm !== null) {
        const baseBPM = parseFloat(cellAudioData[currentCell].bpm);
        const effectiveBPM = baseBPM * speed;
        currentBPMDisplay.textContent = effectiveBPM.toFixed(2);
        startBPMUpdateInterval(); // Reinicia o intervalo para refletir a nova velocidade
    } else {
        currentBPMDisplay.textContent = '--';
    }
    speedSlider.blur();
});

presetHalfSpeedBtn.addEventListener('click', () => {
    speedSlider.value = 0.5;
    speedSlider.dispatchEvent(new Event('input'));
    presetHalfSpeedBtn.blur();
});

presetNormalSpeedBtn.addEventListener('click', () => {
    speedSlider.value = 1.0;
    speedSlider.dispatchEvent(new Event('input'));
    presetNormalSpeedBtn.blur();
});

function applyPitch() {
    if (sourceNode) {
        const semitones = parseInt(pitchInput.value);
        sourceNode.detune.value = semitones * 100;
    }
}

pitchInput.addEventListener('input', function() {
    let semitones = parseInt(this.value);
    if (isNaN(semitones)) semitones = 0;
    if (semitones > 12) semitones = 12;
    if (semitones < -12) semitones = -12;
    this.value = semitones;
    pitchValueSpan.textContent = `${semitones} semitons`;
    applyPitch();
});

increasePitchBtn.addEventListener('click', () => {
    let currentSemitones = parseInt(pitchInput.value);
    if (currentSemitones < 12) {
        pitchInput.value = currentSemitones + 1;
        pitchInput.dispatchEvent(new Event('input'));
    }
    increasePitchBtn.blur();
    pitchInput.blur();
});

decreasePitchBtn.addEventListener('click', () => {
    let currentSemitones = parseInt(pitchInput.value);
    if (currentSemitones > -12) {
        pitchInput.value = currentSemitones - 1;
        pitchInput.dispatchEvent(new Event('input'));
    }
    decreasePitchBtn.blur();
    pitchInput.blur();
});

function resetPitch() {
    pitchInput.value = 0;
    pitchInput.dispatchEvent(new Event('input'));
    pitchInput.blur();
}

resetPitchBtn.addEventListener('click', () => {
    resetPitch();
    resetPitchBtn.blur();
});

document.addEventListener('keydown', function(e) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BUTTON' || document.activeElement.tagName === 'SLIDER')) {
        if (e.key.toLowerCase() === ' ') {
            e.preventDefault(); 
            document.activeElement.blur(); 
        } else {
            return; 
        }
    }

    switch(e.key.toLowerCase()) {
        case 'a':
            if (sourceNode && currentAudioBuffer && isCurrentlyPlaying) { 
                const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                setLoopPoint('start', currentTheoreticalTime);
            }
            break;
        case 'b':
            if (sourceNode && currentAudioBuffer && isCurrentlyPlaying) { 
                const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                setLoopPoint('end', currentTheoreticalTime);
            }
            break;
        case 'x':
            clearLoop();
            break;
        case ' ':
            if (currentCell && cellAudioData[currentCell]) {
                if (isCurrentlyPlaying) {
                    pausePlayback();
                } else {
                    resumePlayback();
                }
            }
            break;
    }
});

function setLoopPoint(point, time) {
    if (!currentAudioBuffer) return;
    
    loopPoints[point] = time;
    
    if (currentAudioBuffer.duration && time > currentAudioBuffer.duration) {
        loopPoints[point] = currentAudioBuffer.duration;
    } else if (time < 0) {
        loopPoints[point] = 0;
    }

    if (point === 'start') {
        document.getElementById('pointA').textContent = formatTime(loopPoints.start);
    } else {
        document.getElementById('pointB').textContent = formatTime(loopPoints.end);
    }

    if (loopPoints.start !== null && loopPoints.end !== null) {
        activateLoop();
    } else {
        updateLoopDisplay();
        updateLoopMarkers();
    }
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
    loopMarkers.classList.remove('active');
    loopMarkers.style.width = '0%';
    loopMarkers.style.left = '0%';
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
        
        if (loopPoints.start !== null || loopPoints.end !== null) {
            loopPointsDiv.style.display = 'block';
        } else {
            loopPointsDiv.style.display = 'none';
        }
    }
}

function updateLoopMarkers() {
    if (!currentAudioBuffer || isNaN(currentAudioBuffer.duration)) {
        loopMarkers.classList.remove('active');
        return;
    }
    
    const duration = currentAudioBuffer.duration;
    
    if (loopPoints.start !== null && loopPoints.end === null) {
        const startPercent = (loopPoints.start / duration) * 100;
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = '1px'; 
        loopMarkers.classList.add('active');
        loopMarkers.style.backgroundColor = 'rgba(255, 255, 0, 0.5)'; 
    }
    else if (loopPoints.start !== null && loopPoints.end !== null) {
        const startPercent = (loopPoints.start / duration) * 100;
        const endPercent = (loopPoints.end / duration) * 100;
        
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = (endPercent - startPercent) + '%';
        loopMarkers.classList.add('active');
        loopMarkers.style.backgroundColor = 'rgba(255, 255, 0, 0.15)'; 
    }
    else {
        loopMarkers.classList.remove('active');
    }
}

function handleAudioEnded() {
    if (!isLooping && currentCell) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }
    stopCurrentAudio(true); 
    clearLoop(); 
    resetPitch();
    currentBPMDisplay.textContent = '--';
}

progressBar.addEventListener('click', async function(e) { // Marcado como async
    if (!currentAudioBuffer || isNaN(currentAudioBuffer.duration) || currentCell === null) {
        console.warn("Não é possível saltar: nenhum áudio carregado ou célula selecionada.");
        return; 
    }
    
    // Tenta retomar o AudioContext antes de qualquer operação
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("AudioContext resumed for progress bar click.");
        } catch (error) {
            console.error("Erro ao retomar AudioContext no click da barra de progresso:", error);
            return; // Não prossegue se não conseguir retomar
        }
    }

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * currentAudioBuffer.duration;
    
    // Sempre salta para o novo tempo na célula atual.
    playAudio(currentCell, newTime); 
    progressBar.blur();
});

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

document.getElementById('cellGrid').addEventListener('click', function(event) {
    const cellElement = event.target.closest('.cell[data-cell-number]');
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);
        
        if (cellNumber === currentCell && isCurrentlyPlaying) {
            pausePlayback();
        } else {
            // Se for uma nova célula ou a mesma célula mas pausada/parada,
            // inicia a reprodução do início (0) para essa célula.
            playAudio(cellNumber, 0); 
        }
        cellElement.blur();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    createCells();
    updateLoopDisplay();
    document.body.addEventListener('click', initAudioContext, { once: true });
    applyPitch(); 
});
