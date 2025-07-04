// main.js

// JavaScript
let currentAudioBuffer = null;
let sourceNode = null;
let audioContext = null;
let currentCell = null; // DEVE SER UM NÚMERO DA CÉLULA (ex: 1, 2, 3...)
let lastPlaybackTime = 0;
let isCurrentlyPlaying = false;

let loopPoints = { start: null, end: null };
let isLooping = false;

// As variáveis globais para os elementos DOM devem ser inicializadas dentro de DOMContentLoaded
// para garantir que os elementos existem.
// Por agora, vamos manter como const onde é possível, mas teremos que ajustar algumas mais abaixo.
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

let cellAudioData = {}; // GARANTIMOS QUE ESTÁ SEMPRE INICIALIZADO COMO UM OBJETO VAZIO

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

// --- Funções de Criação e Manipulação de Células ---

// Criar as células dinamicamente - HTML COMPLETO RESTAURADO AQUI
function createCells() {
    const grid = document.getElementById('cellGrid');
    grid.innerHTML = ''; // Limpa o conteúdo da grelha antes de recriar
    for (let i = 1; i <= totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-cell-number', i);
        // *** HTML CORRIGIDO AQUI PARA INCLUIR TODOS OS ELEMENTOS ***
        cell.innerHTML = `
            <div class="cell-header">
                <div class="cell-number">Célula ${i}</div>
            </div>
            <div class="file-name" id="fileName${i}">Nenhum ficheiro carregado</div>
            <button class="play-btn" id="playBtn${i}" disabled>
                ▶️ Reproduzir
            </button>
        `;
        grid.appendChild(cell);
    }
    // Chamar a função para adicionar listeners aos botões das células recém-criadas
    addCellButtonListeners();
}

// Função para adicionar listeners aos botões de reprodução das células
function addCellButtonListeners() {
    document.querySelectorAll('.cell .play-btn').forEach(button => {
        // Remover listeners antigos para evitar duplicados se createCells for chamada novamente
        button.removeEventListener('click', handleCellButtonClick);
        button.addEventListener('click', handleCellButtonClick);
    });
}

// Handler para o clique no botão de reprodução da célula
function handleCellButtonClick(event) {
    const cellElement = event.target.closest('.cell[data-cell-number]');
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);
        console.log(`Célula clicada (via botão): ${cellNumber}. currentCell antes: ${currentCell}`);
        
        // Se a mesma célula estiver a tocar, pausa. Caso contrário, toca a nova.
        if (cellNumber === currentCell && isCurrentlyPlaying) {
            pausePlayback();
        } else {
            playAudio(cellNumber, 0); 
        }
        event.target.blur(); // Remove o foco do botão para não interferir com atalhos de teclado
    }
}

// --- Event Listeners Globais ---

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

    // **MUDANÇA CRÍTICA AQUI:** Asseguramos que cellAudioData é um objeto vazio antes de carregar
    cellAudioData = {}; // LIMPA O OBJETO GLOBAL DE DADOS DE ÁUDIO
    stopCurrentAudio(true); // Parar e limpar qualquer áudio anterior
    clearLoop();
    resetPitch();
    currentBPMDisplay.textContent = '--';
    
    // Atualizar todas as células visualmente
    document.querySelectorAll('.cell').forEach(cell => {
        const cellNumber = parseInt(cell.dataset.cellNumber);
        document.getElementById(`fileName${cellNumber}`).textContent = 'Nenhum ficheiro carregado';
        const playBtn = document.getElementById(`playBtn${cellNumber}`); // Obtém o botão da célula
        if(playBtn) { // Verifica se o botão existe antes de manipulá-lo
            playBtn.textContent = '▶️ Reproduzir'; // Resetar texto do botão
            playBtn.disabled = true; // Desativar botão
        }
        cell.classList.remove('active', 'has-file'); 
    });


    let filesLoaded = 0;
    let cellIndex = 1;

    for (let i = 0; i < files.length && cellIndex <= totalCells; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/')) {
            console.warn(`Ficheiro "${file.name}" não é um ficheiro de áudio. Ignorando.`);
            continue;
        }

        try {
            if (!audioContext) {
                initAudioContext();
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
           
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            console.log(`Carregado: Célula ${cellIndex}, Ficheiro: ${file.name}, Duração: ${audioBuffer.duration.toFixed(2)}s`);
            cellAudioData[cellIndex] = { audioBuffer: audioBuffer, bpm: null, fileName: file.name };

            document.getElementById(`fileName${cellIndex}`).textContent = file.name;
            const playBtn = document.getElementById(`playBtn${cellIndex}`); // Obtém o botão
            if(playBtn) { // Verifica se o botão existe
                playBtn.disabled = false; // Ativar botão
            }
            document.querySelector(`.cell[data-cell-number="${cellIndex}"]`).classList.add('has-file');

            filesLoaded++;

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
    console.log("Estado final de cellAudioData após o upload:", cellAudioData);
});

async function detectBPMForCell(cellNumber, file) {
    if (typeof DetectBPM !== 'function') {
        console.warn('DetectBPM library (the detection function) not found. Cannot detect BPM.');
        // Certifica-se de que a célula existe em cellAudioData antes de tentar definir o bpm
        if(cellAudioData[cellNumber]) {
            cellAudioData[cellNumber].bpm = null;
        }
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

        // Certifica-se de que a célula existe em cellAudioData antes de tentar definir o bpm
        if(cellAudioData[cellNumber]) {
            cellAudioData[cellNumber].bpm = bpm.toFixed(2);
            console.log(`BPM detetado para célula ${cellNumber} (${file.name}): ${bpm.toFixed(2)}`);
            if (currentCell === cellNumber) {
                currentBPMDisplay.textContent = bpm.toFixed(2);
            }
        } else {
             console.warn(`Célula ${cellNumber} não encontrada em cellAudioData após detecção de BPM.`);
        }
    } catch (error) {
        console.warn(`Não foi possível detetar BPM para o ficheiro ${file.name}: ${error.message}`, error);
        // Certifica-se de que a célula existe em cellAudioData antes de tentar definir o bpm
        if(cellAudioData[cellNumber]) {
            cellAudioData[cellNumber].bpm = null;
        }
        if (currentCell === cellNumber) {
            currentBPMDisplay.textContent = '--';
        }
    }
}

function clearAllCells(resetStatus = true) {
    stopCurrentAudio(true); // Passar 'true' para limpar completamente
    clearLoop();
    resetPitch();

    cellAudioData = {}; // SEMPRE UM OBJETO VAZIO, NUNCA UNDEFINED!
    currentBPMDisplay.textContent = '--';

    document.querySelectorAll('.cell').forEach(cell => {
        const cellNumber = parseInt(cell.dataset.cellNumber);
        document.getElementById(`fileName${cellNumber}`).textContent = 'Nenhum ficheiro carregado';
        const playBtn = document.getElementById(`playBtn${cellNumber}`); // Obtém o botão da célula
        if(playBtn) { // Verifica se o botão existe antes de manipular
            playBtn.textContent = '▶️ Reproduzir'; // Resetar texto do botão
            playBtn.disabled = true; // Desativar botão
        }
        cell.classList.remove('active', 'has-file');
    });

    if (resetStatus) {
        globalUploadStatus.textContent = 'Todas as células limpas.';
    }
    console.log("cellAudioData após clearAllCells:", cellAudioData); // Log para verificar
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

    // Atualiza o texto do botão da célula ativa, se houver
    if (currentCell !== null) {
        const currentCellPlayBtn = document.getElementById(`playBtn${currentCell}`);
        if (currentCellPlayBtn) {
            currentCellPlayBtn.textContent = '▶️ Reproduzir';
        }
        // Remove a classe 'active' da célula atual
        const currentCellElement = document.querySelector(`.cell[data-cell-number="${currentCell}"]`);
        if (currentCellElement) {
            currentCellElement.classList.remove('active');
        }
    }

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

    console.log(`stopCurrentAudio: currentCell = ${currentCell}, isCurrentlyPlaying = ${isCurrentlyPlaying}`);
}

async function playAudio(cellNumber, startTime = 0) {
    initAudioContext(); // Garante que o contexto está inicializado
    
    console.log(`Chamado playAudio para célula: ${cellNumber}, startTime: ${startTime}`); // NOVO LOG
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
    // **AQUI ESTÁ O SEU BREAKPOINT. VERIFIQUE ESTES VALORES!**
    console.log(`playAudioInternal: cellNumber = ${cellNumber}, startTime = ${startTime}`); // NOVO LOG
    console.log("playAudioInternal: Estado atual de cellAudioData:", cellAudioData); // NOVO LOG
    const cellData = cellAudioData[cellNumber];

    if (!cellData || !cellData.audioBuffer) {
        console.warn(`Nenhum AudioBuffer válido na célula ${cellNumber}. cellData:`, cellData); // LOG MAIS ESPECÍFICO
        stopCurrentAudio(true); // Parada completa e limpa UI
        return;
    }
    const audioBuffer = cellData.audioBuffer;

    // Lógica para PAUSAR se a mesma célula estiver a tocar e não for um salto de tempo
    if (currentCell === cellNumber && isCurrentlyPlaying && startTime === lastPlaybackTime) {
        pausePlayback();
        return;
    }
    
    // Parar a reprodução anterior
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null;
    }

    // Remover 'active' da célula anterior, se houver
    if (currentCell !== null && currentCell !== cellNumber) {
        const prevCellElement = document.querySelector(`.cell[data-cell-number="${currentCell}"]`);
        if (prevCellElement) {
            prevCellElement.classList.remove('active');
        }
        const prevPlayBtn = document.getElementById(`playBtn${currentCell}`);
        if(prevPlayBtn) {
            prevPlayBtn.textContent = '▶️ Reproduzir';
        }
    }

    currentAudioBuffer = audioBuffer;
    currentCell = cellNumber; // **ESTA LINHA DEVE SER SEMPRE EXECUTADA!**
    lastPlaybackTime = startTime; 

    currentBPMDisplay.textContent = cellData.bpm !== null ? cellData.bpm : '--';

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = currentAudioBuffer;
    sourceNode.connect(audioContext.destination);

    sourceNode.playbackRate.value = parseFloat(speedSlider.value);
    sourceNode.detune.value = parseInt(pitchInput.value) * 100;

    sourceNode.onended = () => {
        if (!isLooping) {
            handleAudioEnded();
        }
    };

    sourceNode.start(0, lastPlaybackTime);
    audioStartTimeContext = audioContext.currentTime;
    audioOffsetPlayback = lastPlaybackTime;

    document.getElementById('totalTime').textContent = formatTime(currentAudioBuffer.duration);

    // Adicionar 'active' à célula atual e atualizar o seu botão
    const currentCellElement = document.querySelector(`.cell[data-cell-number="${cellNumber}"]`);
    if (currentCellElement) {
        currentCellElement.classList.add('active');
    }
    const currentPlayBtn = document.getElementById(`playBtn${cellNumber}`);
    if(currentPlayBtn) {
        currentPlayBtn.textContent = '⏸️ Pausar';
    }
    
    isCurrentlyPlaying = true; 

    startProgressUpdate(); 
    startBPMUpdateInterval();
    console.log(`playAudioInternal: Reprodução iniciada para célula ${cellNumber} a partir de ${startTime}. currentCell: ${currentCell}`); // NOVO LOG
}

function pausePlayback() {
    if (sourceNode && audioContext.state === 'running' && isCurrentlyPlaying) {
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

        if (currentCell) {
            const currentCellElement = document.querySelector(`.cell[data-cell-number="${currentCell}"]`);
            if (currentCellElement) {
                currentCellElement.classList.remove('active');
            }
            const playBtn = document.getElementById(`playBtn${currentCell}`);
            if (playBtn) {
                playBtn.textContent = '▶️ Reproduzir';
            }
        }
    }
    console.log(`pausePlayback: currentCell = ${currentCell}, lastPlaybackTime = ${lastPlaybackTime}`); // NOVO LOG
}

async function resumePlayback() {
    if (!currentCell || !cellAudioData[currentCell]) {
        console.warn("Nenhuma célula ou dados de áudio para retomar a reprodução.");
        return;
    }

    if (isCurrentlyPlaying) {
        console.log("Áudio já está a tocar, não é necessário retomar.");
        return;
    }

    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("AudioContext resumed for resumePlayback.");
        } catch (e) {
            console.error("Erro ao retomar AudioContext para resumePlayback:", e);
            return;
        }
    }
    
    if (currentAudioBuffer) {
        playAudioInternal(currentCell, lastPlaybackTime); 
    } else { 
        console.warn("AudioBuffer não está carregado para a célula atual durante resumePlayback.");
        stopCurrentAudio(true);
    }
    console.log(`resumePlayback: Tentando retomar célula ${currentCell} de ${lastPlaybackTime}`); // NOVO LOG
}


let progressInterval = null;
let audioStartTimeContext = 0;
let audioOffsetPlayback = 0;

function startProgressUpdate() {
    if (progressInterval) clearInterval(progressInterval);

    // Removido o `audioContext.resume()` daqui, pois já é feito em `playAudio` e `resumePlayback`
    // para evitar chamadas redundantes e potencialmente problemáticas.

    audioStartTimeContext = audioContext.currentTime;
    audioOffsetPlayback = lastPlaybackTime;

    progressInterval = setInterval(() => {
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
                    if (sourceNode) {
                        sourceNode.stop();
                        sourceNode.disconnect();
                        sourceNode = null; 
                    }
                    playAudioInternal(currentCell, loopPoints.start);
                }
            } else if (currentTheoreticalTime >= currentAudioBuffer.duration) {
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

        if (!sourceNode || audioContext.state !== 'running' || !currentAudioBuffer || !isCurrentlyPlaying) {
            stopBPMUpdate();
            return;
        }
    }, updateIntervalMs);
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
    
    if (currentCell && cellAudioData[currentCell] && currentAudioBuffer && isCurrentlyPlaying) {
        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
        const currentTimeInAudio = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
        
        if (sourceNode) {
            sourceNode.stop();
            sourceNode.disconnect();
            sourceNode = null;
        }
        playAudioInternal(currentCell, currentTimeInAudio);
    } else if (sourceNode) { // Se não estiver a tocar mas houver um sourceNode ativo
        sourceNode.playbackRate.value = speed;
    }


    if (currentCell && cellAudioData[currentCell] && cellAudioData[currentCell].bpm !== null) {
        const baseBPM = parseFloat(cellAudioData[currentCell].bpm);
        const effectiveBPM = baseBPM * speed;
        currentBPMDisplay.textContent = effectiveBPM.toFixed(2);
        // startBPMUpdateInterval(); // Já é chamado por playAudioInternal ou handleAudioEnded
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
});

resetPitchBtn.addEventListener('click', () => {
    resetPitch();
    resetPitchBtn.blur();
});

document.addEventListener('keydown', function(e) {
    // Adicionamos uma verificação mais robusta para elementos focados
    // e permitimos que o espaço funcione como play/pause apenas se nada mais estiver focado
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BUTTON' || document.activeElement.tagName === 'SLIDER' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable)) {
        if (e.key.toLowerCase() === ' ') {
            e.preventDefault(); // Previne o comportamento padrão (ex: scroll)
            document.activeElement.blur(); // Remove o foco do elemento
        } else {
            return; // Se um elemento interativo está focado e não é espaço, deixa o evento seguir
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
        case ' ': // Espaço para Play/Pause
            if (currentCell && cellAudioData[currentCell]) {
                if (isCurrentlyPlaying) {
                    pausePlayback();
                } else {
                    resumePlayback();
                }
            } else {
                console.log("Nenhuma célula selecionada ou carregada para reproduzir/pausar.");
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
        // A lógica para remover a classe 'active' e resetar o botão já está em stopCurrentAudio(true)
    }
    stopCurrentAudio(true); 
    clearLoop(); 
    resetPitch();
    currentBPMDisplay.textContent = '--';
}

progressBar.addEventListener('click', async function(e) {
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
            return;
        }
    }

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * currentAudioBuffer.duration;
    
    console.log(`Barra de Progresso Clicada: currentCell = ${currentCell}, newTime = ${newTime.toFixed(2)}s`); // NOVO LOG

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

// REMOVIDO: O event listener delegado no 'cellGrid' agora é desnecessário para os botões de reprodução
// pois cada botão tem o seu próprio listener adicionado por `addCellButtonListeners()`.
// Manter um click listener para a célula inteira (não no botão) pode ser feito, mas é diferente do que o botão faz.
// Se quiser que clicar na célula inteira (fora do botão) também inicie a reprodução, pode adicioná-lo aqui.
// Por enquanto, o foco é nos botões.
// document.getElementById('cellGrid').addEventListener('click', function(event) {
//     const cellElement = event.target.closest('.cell[data-cell-number]');
//     if (cellElement && !event.target.classList.contains('play-btn')) { // Evita duplicar o comportamento do botão
//         const cellNumber = parseInt(cellElement.dataset.cellNumber);
//         console.log(`Célula clicada (fora do botão): ${cellNumber}. currentCell antes: ${currentCell}`);
//         
//         if (cellNumber === currentCell && isCurrentlyPlaying) {
//             pausePlayback();
//         } else {
//             playAudio(cellNumber, 0); 
//         }
//         cellElement.blur();
//     }
// });


document.addEventListener('DOMContentLoaded', () => {
    createCells(); // Cria as células com o HTML completo e anexa os listeners dos botões
    updateLoopDisplay();
    // Adiciona o listener para inicializar o AudioContext apenas na primeira interação do utilizador
    document.body.addEventListener('click', initAudioContext, { once: true });
    applyPitch(); // Aplica o pitch inicial se houver um sourceNode
});
