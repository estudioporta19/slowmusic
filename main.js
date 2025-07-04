// JavaScript
let currentAudioBuffer = null;
let sourceNode = null;
let audioContext = null;
let currentCell = null;
let lastPlaybackTime = 0; // Armazena o tempo no áudio em que a reprodução parou/pausou
let isCurrentlyPlaying = false; // Novo estado para controlar se está a tocar ativamente

let loopPoints = { start: null, end: null };
let isLooping = false;

const audioPlayerHtml = document.getElementById('audioPlayer'); // Este elemento HTML <audio> não está a ser usado na lógica do Web Audio API

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
const increasePitchBtn = document = document.getElementById('increasePitchBtn');
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
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            } else if (!audioContext) {
                initAudioContext();
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
            }

            if (!audioContext) {
                console.error("AudioContext não disponível. Não é possível decodificar áudio.");
                globalUploadStatus.textContent = `Erro: AudioContext não está pronto. Por favor, clique na página para ativá-lo e tente novamente.`;
                continue;
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
    // Remove as linhas do <audio> tag, pois não são relevantes
    // audioPlayerHtml.pause();
    // audioPlayerHtml.currentTime = 0;

    isCurrentlyPlaying = false; // Atualiza o estado de reprodução

    if (fullStop) {
        currentAudioBuffer = null;
        currentCell = null; // Também deve ser nulo se não houver faixa selecionada
        lastPlaybackTime = 0; // Se for uma parada total, começa do zero
    } else {
        // Se não for uma parada total (ex: pausar para saltar),
        // o lastPlaybackTime já foi calculado em pausePlayback ou será ajustado em playAudioInternal.
    }
    
    progressFill.style.width = '0%';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('totalTime').textContent = '0:00';
    pauseProgressUpdate();
    stopBPMUpdate();
    currentBPMDisplay.textContent = '--';

    // Desativar a célula visualmente se houver uma ativa
    if (fullStop) { // Apenas desativa visualmente se for uma parada completa
        document.querySelectorAll('.cell.active').forEach(cell => cell.classList.remove('active'));
    }
}

function playAudio(cellNumber, startTime = 0) {
    initAudioContext();
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            playAudioInternal(cellNumber, startTime);
        }).catch(e => console.error("Erro ao retomar AudioContext:", e));
    } else {
        playAudioInternal(cellNumber, startTime);
    }
}

function playAudioInternal(cellNumber, startTime = 0) {
    const cellData = cellAudioData[cellNumber];
    if (!cellData || !cellData.audioBuffer) {
        console.warn(`Nenhum AudioBuffer na célula ${cellNumber}.`);
        stopCurrentAudio(true); // Parada completa e limpa UI
        return;
    }
    const audioBuffer = cellData.audioBuffer;

    // Lógica para alternar play/pause se for a mesma célula e já estiver a tocar
    if (currentCell === cellNumber && isCurrentlyPlaying) {
        pausePlayback();
        return;
    }
    
    // Se for uma nova célula OU se for a mesma célula mas não estiver a tocar (está pausado ou parou)
    // Parar o nó anterior se ele existir
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null;
    }

    // Definir o currentAudioBuffer e currentCell para a faixa que será reproduzida
    currentAudioBuffer = audioBuffer;
    currentCell = cellNumber;

    // Se estamos a iniciar uma reprodução a partir de um ponto (startTime > 0)
    // ou se estamos a iniciar uma nova faixa (cellNumber != currentCell),
    // definimos lastPlaybackTime para o startTime fornecido.
    // Caso contrário (se for um clique na mesma célula para retomar do último ponto),
    // o lastPlaybackTime já deve ter sido definido por pausePlayback.
    if (startTime !== 0 || currentCell !== cellNumber) {
        lastPlaybackTime = startTime;
    }

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

    sourceNode.start(0, lastPlaybackTime); // Começa do último offset ou do tempo clicado
    audioStartTimeContext = audioContext.currentTime; // Reinicia o tempo de contexto
    audioOffsetPlayback = lastPlaybackTime; // Reinicia o offset de reprodução

    document.getElementById('totalTime').textContent = formatTime(currentAudioBuffer.duration);

    document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active'));
    document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active');
    
    isCurrentlyPlaying = true; // Atualiza o estado para "a tocar"

    startProgressUpdate(); // Inicia com o lastPlaybackTime como initialOffset
    startBPMUpdateInterval();
}

function pausePlayback() {
    if (sourceNode && audioContext.state === 'running') {
        // Calcular o tempo atual da faixa antes de pausar
        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
        lastPlaybackTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);

        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null; // O nó deve ser destruído ao pausar

        audioContext.suspend();
        pauseProgressUpdate();
        stopBPMUpdate();
        isCurrentlyPlaying = false; // Atualiza o estado para "pausado"
    }
}

function resumePlayback() {
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

    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            // Usa lastPlaybackTime para retomar
            playAudioInternal(currentCell, lastPlaybackTime);
        }).catch(e => console.error("Erro ao retomar AudioContext para resumePlayback:", e));
    } else if (!sourceNode && currentAudioBuffer) { // Se não há sourceNode mas há um buffer carregado (terminou ou nunca foi reproduzido)
        playAudioInternal(currentCell, lastPlaybackTime); // Retoma do lastPlaybackTime (pode ser 0)
    } else if (!currentAudioBuffer && currentCell) { // Se a célula está selecionada mas o buffer foi limpo (ex: clearAllCells)
        console.warn("AudioBuffer não está carregado para a célula atual.");
        stopCurrentAudio(true); // Limpa completamente o estado.
    }
}

let progressInterval = null;
let audioStartTimeContext = 0;
let audioOffsetPlayback = 0;

function startProgressUpdate() {
    if (progressInterval) clearInterval(progressInterval);

    // Resume o contexto se estiver suspenso para que o tempo do contexto avance.
    // Isso é importante para que `audioContext.currentTime` avance.
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed for progress update.");
        }).catch(e => console.error("Failed to resume AudioContext for progress update:", e));
    }

    audioStartTimeContext = audioContext.currentTime;
    audioOffsetPlayback = lastPlaybackTime; // Usa o lastPlaybackTime como ponto de partida

    progressInterval = setInterval(() => {
        if (!sourceNode || audioContext.state !== 'running' || !currentAudioBuffer) {
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
                    if (sourceNode) { // Garantir que sourceNode existe antes de parar
                        sourceNode.stop();
                        sourceNode.disconnect();
                        sourceNode = null;
                    }
                    playAudioInternal(currentCell, loopPoints.start); // Reinicia a reprodução do ponto A
                }
            } else if (currentTheoreticalTime >= currentAudioBuffer.duration) {
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
    const fourBeatDurationSeconds = beatDurationSeconds * 4;

    currentBPMDisplay.textContent = effectiveBPM.toFixed(2);

    bpmUpdateInterval = setInterval(() => {
        if (currentCell && cellAudioData[currentCell] && cellAudioData[currentCell].bpm !== null) {
            const currentSpeedDuringUpdate = parseFloat(speedSlider.value);
            const updatedEffectiveBPM = parseFloat(cellAudioData[currentCell].bpm) * currentSpeedDuringUpdate;
            currentBPMDisplay.textContent = updatedEffectiveBPM.toFixed(2);
        } else {
            currentBPMDisplay.textContent = '--';
        }

        if (!sourceNode || audioContext.state !== 'running' || !currentAudioBuffer) {
            stopBPMUpdate();
            return;
        }
    }, fourBeatDurationSeconds * 1000);
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
    if (currentCell && cellAudioData[currentCell] && isCurrentlyPlaying) {
        const currentTimeInAudio = lastPlaybackTime + (audioContext.currentTime - audioStartTimeContext) * sourceNode.playbackRate.value;
        
        // Parar o nó existente para aplicar a nova velocidade recriando
        if (sourceNode) {
            sourceNode.stop();
            sourceNode.disconnect();
            sourceNode = null;
        }
        playAudioInternal(currentCell, currentTimeInAudio); // Reinicia a reprodução com a nova velocidade
    } else if (sourceNode) {
        // Se estiver pausado, apenas atualiza a propriedade playbackRate do nó existente
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
        // Permitir que as teclas funcionem nos inputs, mas barra de espaço pode ser um problema
        if (e.key.toLowerCase() === ' ') {
            e.preventDefault(); // Impede a barra de espaço de ativar botões
            document.activeElement.blur(); // Remove o foco do elemento
            // E continua para a lógica de play/pause global
        } else {
            return; // Se não for barra de espaço, e o foco estiver num input/botão, sai da função
        }
    }

    switch(e.key.toLowerCase()) {
        case 'a':
            if (sourceNode && currentAudioBuffer && isCurrentlyPlaying) { // Apenas permite definir loop points se estiver a tocar
                const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                setLoopPoint('start', currentTheoreticalTime);
            }
            break;
        case 'b':
            if (sourceNode && currentAudioBuffer && isCurrentlyPlaying) { // Apenas permite definir loop points se estiver a tocar
                const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                setLoopPoint('end', currentTheoreticalTime);
            }
            break;
        case 'x':
            clearLoop();
            break;
        case ' ':
            // A barra de espaço já foi prevenida no início da função
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
    
    // Garantir que os pontos de loop não excedem a duração total do áudio
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
        
        // Exibir os pontos se eles existirem, mesmo que o loop esteja desativado
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
        loopMarkers.style.width = '1px'; // Apenas uma linha para o ponto A
        loopMarkers.classList.add('active');
        loopMarkers.style.backgroundColor = 'rgba(255, 255, 0, 0.5)'; // Ponto A visível
    }
    else if (loopPoints.start !== null && loopPoints.end !== null) {
        const startPercent = (loopPoints.start / duration) * 100;
        const endPercent = (loopPoints.end / duration) * 100;
        
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = (endPercent - startPercent) + '%';
        loopMarkers.classList.add('active');
        loopMarkers.style.backgroundColor = 'rgba(255, 255, 0, 0.15)'; // Intervalo do loop
    }
    else {
        loopMarkers.classList.remove('active');
    }
}

function handleAudioEnded() {
    if (currentCell) {
        document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
    }
    stopCurrentAudio(true); // Chamada para parada completa no fim da faixa
    clearLoop(); // Limpa os pontos de loop no final
    resetPitch();
    currentBPMDisplay.textContent = '--';
}

progressBar.addEventListener('click', function(e) {
    if (!currentAudioBuffer || isNaN(currentAudioBuffer.duration)) return; // Se não houver áudio carregado, sai.
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * currentAudioBuffer.duration;
    
    if (currentCell !== null) {
        // Se a célula atual está definida, salta para o novo tempo
        playAudio(currentCell, newTime); 
    }
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
        
        // Se a célula clicada for a CÉLULA ATUAL e estiver a tocar, pausa.
        // Caso contrário, reproduz (ou retoma) a partir do início ou do ponto guardado.
        if (cellNumber === currentCell && isCurrentlyPlaying) {
            pausePlayback();
        } else {
            // Se for uma nova célula ou a mesma mas não a tocar, reproduz
            playAudio(cellNumber, 0); // Sempre começa do início ao clicar na célula
        }
        cellElement.blur();
    }
});

// Este código será executado APENAS quando o DOM estiver completamente carregado.
document.addEventListener('DOMContentLoaded', () => {
    createCells();
    updateLoopDisplay();
    // Adiciona um listener no corpo para inicializar AudioContext com a primeira interação
    document.body.addEventListener('click', initAudioContext, { once: true });
    applyPitch();
});
