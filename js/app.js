// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, audioBuffer: AudioBuffer, fileName: string, shifter: SoundTouch.PitchShifter, lastPlaybackTime: number } }
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

// Criar um AudioContext global para SoundTouch.js
let audioCtx;

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o AudioContext com a primeira interação do utilizador.
    // Isso é crucial para as políticas de autoplay dos navegadores.
    const initializeAudioContext = () => {
        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext resumed/initialized from user gesture.');
        }
        // Remove os listeners após a inicialização
        document.documentElement.removeEventListener('mousedown', initializeAudioContext);
        document.documentElement.removeEventListener('keydown', initializeAudioContext);
    };

    document.documentElement.addEventListener('mousedown', initializeAudioContext, { once: true });
    document.documentElement.addEventListener('keydown', initializeAudioContext, { once: true });

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
            if (audioFiles[i].shifter) {
                audioFiles[i].shifter.disconnect(); // Desconecta o shifter
                // SoundTouch.js não tem um método dispose() explícito para o PitchShifter,
                // mas desconectar e remover referências ajuda o garbage collector.
            }
            if (audioFiles[i].audioBuffer) {
                // Não há um método dispose() para AudioBuffer, será coletado pelo GC
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

// --- Lógica de Carregamento e Reprodução de Áudio (SoundTouch.js) ---

globalUploadBtn.addEventListener('click', () => {
    globalFileInput.click();
});

globalFileInput.addEventListener('change', async (event) => {
    // Garante que o AudioContext é inicializado antes de tentar decodificar áudio
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext inicializado ao carregar ficheiro.');
    }

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
            // Verificação robusta para SoundTouch
            if (typeof SoundTouch === 'undefined' || typeof SoundTouch.PitchShifter === 'undefined') {
                console.error("Erro: A biblioteca SoundTouch ou a classe PitchShifter não está definida. Verifique o script SoundTouch.js no seu HTML.");
                globalUploadStatus.textContent = "Erro: Biblioteca de áudio não carregada corretamente.";
                return; // Sai da função se a biblioteca não estiver carregada
            }

            // Ler o ficheiro como ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            // Decodificar o ArrayBuffer para AudioBuffer usando o AudioContext
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');

            // Acessando PitchShifter através do objeto global SoundTouch
            const shifter = new SoundTouch.PitchShifter(audioCtx, audioBuffer, 1024); // 1024 é o bufferSize, pode ajustar
            
            // Configurar o evento 'play' para atualizar o progresso
            shifter.on('play', (detail) => {
                if (currentCell && audioFiles[currentCell] && audioFiles[currentCell].shifter === shifter) {
                    const duration = audioFiles[currentCell].audioBuffer.duration;
                    let currentTime = detail.timePlayed;

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

                    // Verifica se o áudio terminou (se não estiver em loop)
                    if (!isLooping && currentTime >= duration - 0.1 && isPlaying) { // Margem de erro para o fim
                        console.log(`Playback ended for cell ${currentCell}.`);
                        stopCurrentAudio();
                        if (currentCell) {
                            document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
                        }
                        currentCell = null;
                        clearLoop();
                    }
                }
            });

            audioFiles[cellIndex] = {
                fileURL: URL.createObjectURL(file), // Guardar URL para revogar, se necessário
                audioBuffer: audioBuffer,
                fileName: fileNameWithoutExtension || file.name,
                shifter: shifter,
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
    if (currentCell !== null && audioFiles[currentCell] && audioFiles[currentCell].shifter) {
        audioFiles[currentCell].shifter.disconnect(); // Desconecta para parar a reprodução
        audioFiles[currentCell].lastPlaybackTime = audioFiles[currentCell].shifter.timePlayed; // Guarda o tempo para retomar
    }
    isPlaying = false;
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
    progressFill.style.width = '0%'; 
    document.getElementById('currentTime').textContent = '0:00'; 
}

// Função para iniciar a reprodução com SoundTouch.js
async function playAudio(cellNumber, startOffset = 0) {
    if (!audioCtx) {
        console.warn("AudioContext não inicializado. Clique na página para iniciar.");
        return;
    }

    const audioData = audioFiles[cellNumber];

    if (!audioData || !audioData.shifter || !audioData.audioBuffer) {
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

    const shifter = audioData.shifter;
    const duration = audioData.audioBuffer.duration;

    // Aplicar velocidade e pitch
    shifter.tempo = parseFloat(speedSlider.value); // SoundTouch.js usa 'tempo' como multiplicador de velocidade
    // SoundTouch.js 'pitch' é um multiplicador. Converter semitons para multiplicador.
    // 2^(semitons / 12)
    shifter.pitch = Math.pow(2, parseInt(pitchSlider.value) / 1200); // 1200 cents = 12 semitons = 1 oitava

    document.getElementById('totalTime').textContent = formatTime(duration);

    // Configurar o loop no shifter
    if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
        shifter.loop = true;
        shifter.loopStart = loopPoints.start;
        shifter.loopEnd = loopPoints.end;
        if (startOffset < loopPoints.start || startOffset >= loopPoints.end) {
            startOffset = loopPoints.start; // Começa no início do loop se o offset estiver fora
        }
    } else {
        shifter.loop = false;
    }

    // Conectar e iniciar o shifter
    shifter.connect(audioCtx.destination);
    shifter.play(startOffset); // Inicia a reprodução a partir do offset
    isPlaying = true;

    // O progresso é atualizado no evento 'play' do shifter, não mais por setInterval aqui.
    // O setInterval pode ser usado para coisas que não dependem do 'play' event, se necessário.
}


// --- Controles de Velocidade e Pitch ---
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].shifter) {
        const shifter = audioFiles[currentCell].shifter;
        shifter.tempo = newSpeed; // Aplica a nova velocidade
        // O PitchShifter do SoundTouch.js já mantém o pitch ao alterar o tempo
        // Apenas precisamos de garantir que o pitch do slider é aplicado corretamente
        shifter.pitch = Math.pow(2, parseInt(pitchSlider.value) / 1200);
    }
});
speedSlider.addEventListener('mouseup', function() { this.blur(); });
speedSlider.addEventListener('touchend', function() { this.blur(); });

pitchSlider.addEventListener('input', (e) => {
    const newPitchCents = parseInt(e.target.value);
    applyPitchToDisplay(newPitchCents); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].shifter) {
        const shifter = audioFiles[currentCell].shifter;
        // Converte cents para multiplicador de frequência (semitones/12)
        shifter.pitch = Math.pow(2, newPitchCents / 1200);
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

    if (!currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].audioBuffer) return; 

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
    const shifter = audioData.shifter;

    if (isPlaying) {
        audioData.lastPlaybackTime = shifter.timePlayed; // Guarda o tempo para retomar
        shifter.disconnect(); // Desconecta para pausar
        isPlaying = false;
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    } else {
        const resumeTime = audioData.lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioData.lastPlaybackTime = 0; // Reset para a próxima vez que tocar do início
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    if (!isPlaying || !currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].shifter) return;
    
    const shifter = audioFiles[currentCell].shifter;
    let currentTime = shifter.timePlayed; 
    
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
        // Aplica o loop no shifter se estiver a tocar
        if (isPlaying && currentCell && audioFiles[currentCell].shifter) {
            const shifter = audioFiles[currentCell].shifter;
            shifter.loop = true;
            shifter.loopStart = loopPoints.start;
            shifter.loopEnd = loopPoints.end;
            
            // Se a posição atual estiver fora do novo loop, reposiciona.
            const currentShifterTime = shifter.timePlayed;
            if (currentShifterTime < loopPoints.start || currentShifterTime >= loopPoints.end) {
                shifter.disconnect(); // Parar para reposicionar
                shifter.play(loopPoints.start); // Iniciar no início do loop
                shifter.connect(audioCtx.destination); // Reconectar
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
    // Remove o loop do shifter se estiver a tocar
    if (currentCell && audioFiles[currentCell] && audioFiles[currentCell].shifter) {
        const shifter = audioFiles[currentCell].shifter;
        shifter.loop = false;
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
        
        if (currentCell) { 
            playAudio(currentCell, newTime); 
        }
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
