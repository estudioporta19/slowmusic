// js/app.js

// --- Variáveis Globais e Referências de Elementos ---
let audioFiles = {}; // Guarda { cellNumber: { fileURL: string, toneBuffer: Tone.Buffer, fileName: string, player: Tone.GrainPlayer, lastPlaybackTime: number } }
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
    // Resetar o display de tempo ao limpar
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
            // Cria um URL para o ficheiro local para que o Tone.Buffer.fromUrl possa aceder
            const fileURL = URL.createObjectURL(file);
            const toneBuffer = await Tone.Buffer.fromUrl(fileURL);
            
            const fileNameWithoutExtension = file.name.split('.').slice(0, -1).join('.');

            // Cria um GrainPlayer para cada buffer carregado
            // Encaminha o player para o destino de áudio (suas colunas de som)
            const player = new Tone.GrainPlayer(toneBuffer).toDestination();
            player.loop = false; // Gerenciamos o loop manualmente, o player.loop é para a reprodução contínua
            player.loopStart = 0; // Define o início do loop padrão
            player.loopEnd = toneBuffer.duration; // Define o fim do loop padrão como a duração total

            audioFiles[cellIndex] = {
                fileURL: fileURL, 
                toneBuffer: toneBuffer,
                fileName: fileNameWithoutExtension || file.name,
                player: player,
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
    // Isso previne que um loop de uma faixa anterior afete a nova faixa
    if (audioData.lastCellId !== currentCell) { 
        clearLoop(); // Certifica-se de que o loop é limpo ao mudar de faixa
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
        // Se estamos a iniciar no meio de um loop, o startOffset deve ser o loopPoint.start
        if (startOffset < loopPoints.start || startOffset >= loopPoints.end) {
            startOffset = loopPoints.start;
        }
    } else {
        player.loop = false;
    }

    // Iniciar o player
    player.start(0, startOffset); // O primeiro 0 é o tempo em que o player deve começar a tocar (imediatamente), o segundo é o offset no buffer
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

        // Obtém o tempo de reprodução atual do player
        let currentTime = player.toSeconds(player.immediate()); 
        const duration = player.buffer.duration;

        let progress;
        if (isLooping && loopPoints.start !== null && loopPoints.end !== null) {
            // Se estiver em loop, o progresso é calculado dentro do segmento de loop
            const loopDuration = loopPoints.end - loopPoints.start;
            // Garante que o tempo atual é mapeado dentro do segmento de loop para o display
            const currentOffsetInLoop = (currentTime - loopPoints.start) % loopDuration;
            currentTime = loopPoints.start + currentOffsetInLoop; 
            progress = ((currentTime - loopPoints.start) / loopDuration) * 100;
        } else {
            progress = (currentTime / duration) * 100;
        }

        progress = Math.min(100, Math.max(0, progress)); // Limita o progresso entre 0 e 100
        currentTime = Math.min(duration, Math.max(0, currentTime)); // Limita o tempo para não exceder a duração

        progressFill.style.width = progress + '%';
        document.getElementById('currentTime').textContent = formatTime(currentTime);
        document.getElementById('totalTime').textContent = formatTime(duration);

        // Verificação manual de fim de faixa para não-loop, pois player.onEnded não é chamado em tempo real pelo setInterval
        if (!isLooping && currentTime >= duration - 0.05) { // Uma pequena margem de erro
             stopCurrentAudio();
             if (currentCell) {
                 document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
             }
             currentCell = null;
             clearLoop(); // Assegura que o loop é limpo no final da faixa
             progressFill.style.width = '0%';
             document.getElementById('currentTime').textContent = '0:00';
             document.getElementById('totalTime').textContent = '0:00';
        }

    }, 100); // Atualiza a cada 100ms
}


// --- Controles de Velocidade e Pitch ---
speedSlider.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    applySpeedToDisplay(newSpeed); 
    if (isPlaying && currentCell !== null && audioFiles[currentCell].player) {
        audioFiles[currentCell].player.playbackRate = newSpeed; // Aplica em tempo real
    }
});
// Eventos para remover o foco dos sliders após soltar o mouse/dedo
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
    // Converte cents para semitons para exibição (100 cents = 1 semitom)
    pitchValue.textContent = (pitchCents / 100) + ' semitons'; 
}


// --- Atalhos do Teclado ---
document.addEventListener('keydown', function(e) {
    // Ignora eventos de teclado se o foco estiver num campo de input ou botão
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.slider')) {
        return;
    }

    // Se nenhuma célula carregada ou buffer não pronto, não faz nada
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
            e.preventDefault(); // Previne a rolagem da página ao pressionar a barra de espaço
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
        audioData.lastPlaybackTime = player.toSeconds(player.immediate()); // Obtém o tempo exato de reprodução
        player.stop();
        isPlaying = false;
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    } else {
        // Reproduzir: Inicia do último tempo de pausa ou do início
        const resumeTime = audioData.lastPlaybackTime || 0;
        playAudio(currentCell, resumeTime);
        audioData.lastPlaybackTime = 0; // Reseta após retomar a reprodução
    }
}

// --- Lógica de Loop ---
function setLoopPoint(point) {
    // Só permite definir pontos de loop se houver áudio a tocar
    if (!isPlaying || !currentCell || !audioFiles[currentCell] || !audioFiles[currentCell].player) return;
    
    const player = audioFiles[currentCell].player;
    // Obtém o tempo de reprodução atual para definir o ponto de loop
    let currentTime = player.toSeconds(player.immediate()); 
    
    const duration = player.buffer.duration;
    // Garante que o tempo está dentro dos limites da duração da faixa
    const adjustedTime = Math.min(Math.max(0, currentTime), duration);
    loopPoints[point] = adjustedTime;
    
    const pointAElement = document.getElementById('pointA');
    const pointBElement = document.getElementById('pointB');

    if (point === 'start') {
        pointAElement.textContent = formatTime(adjustedTime);
        pointAElement.classList.add('loop-point-highlight'); // Adiciona um highlight visual
        setTimeout(() => {
            pointAElement.classList.remove('loop-point-highlight');
        }, 800);
    } else { // point === 'end'
        pointBElement.textContent = formatTime(adjustedTime);
        pointBElement.classList.add('loop-point-highlight'); // Adiciona um highlight visual
        setTimeout(() => {
            pointBElement.classList.remove('loop-point-highlight');
        }, 800);
        
        // Se ambos os pontos estiverem definidos, ative o loop
        if (loopPoints.start !== null) {
            activateLoop();
        }
    }
    
    updateLoopDisplay();
    updateLoopMarkers();
}

function activateLoop() {
    if (loopPoints.start !== null && loopPoints.end !== null) {
        // Garante que o ponto inicial é menor que o ponto final
        if (loopPoints.start > loopPoints.end) {
            [loopPoints.start, loopPoints.end] = [loopPoints.end, loopPoints.start]; // Troca os valores
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
    // Esconde os marcadores se não houver áudio carregado
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
        loopMarkers.style.background = 'rgba(255, 255, 0, 0.2)'; // Cor da área do loop

        loopHandleA.style.left = startPercent + '%';
        loopHandleB.style.left = endPercent + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'block';

    } else if (loopPoints.start !== null) { // Apenas ponto A definido
        const startPercent = (loopPoints.start / duration) * 100;
        
        loopMarkers.style.left = startPercent + '%';
        loopMarkers.style.width = '2px'; // Uma linha fina para mostrar apenas o ponto A
        loopMarkers.classList.add('active');
        loopMarkers.style.display = 'block';
        loopMarkers.style.background = 'transparent'; // Sem preenchimento de área

        loopHandleA.style.left = startPercent + '%';
        loopHandleA.style.display = 'block';
        loopHandleB.style.display = 'none'; // Esconde o handle B

    } else { // Nenhum ponto de loop definido
        loopMarkers.classList.remove('active');
        loopMarkers.style.display = 'none';
        loopHandleA.style.display = 'none';
        loopHandleB.style.display = 'none';
    }
}

// --- Lógica de Arraste dos Marcadores e Cliques na ProgressBar ---
progressBar.addEventListener('mousedown', (e) => {
    // Só permite interação se houver áudio carregado
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
    // Só permite arraste se estiver a arrastar um handle e houver áudio
    if (!isDraggingLoopHandle || !audioFiles[currentCell] || !audioFiles[currentCell].toneBuffer || !audioFiles[currentCell].toneBuffer.loaded) return;

    e.preventDefault(); // Previne a seleção de texto ao arrastar

    const rect = progressBar.getBoundingClientRect();
    let newX = e.clientX - rect.left;
    newX = Math.max(0, Math.min(newX, rect.width)); // Limita dentro da barra de progresso

    const percentage = newX / rect.width;
    const newTime = percentage * audioFiles[currentCell].toneBuffer.duration;

    if (activeLoopHandle === 'start') {
        loopPoints.start = newTime;
        // Se o ponto de início ultrapassar o de fim, ajusta
        if (loopPoints.end !== null && loopPoints.start > loopPoints.end) {
            loopPoints.start = loopPoints.end;
        }
        document.getElementById('pointA').textContent = formatTime(loopPoints.start);
    } else if (activeLoopHandle === 'end') {
        loopPoints.end = newTime;
        // Se o ponto de fim for menor que o de início, ajusta
        if (loopPoints.start !== null && loopPoints.end < loopPoints.start) {
            loopPoints.end = loopPoints.start;
        }
        document.getElementById('pointB').textContent = formatTime(loopPoints.end);
    }
    activateLoop(); // Ativa/atualiza o loop com os novos pontos
    updateLoopMarkers(); // Atualiza a posição visual dos marcadores
});

document.addEventListener('mouseup', () => {
    if (isDraggingLoopHandle) {
        isDraggingLoopHandle = false;
        activeLoopHandle = null;
        activateLoop(); // Garante que o loop é ativado com os pontos finais após o arraste
    }
});

// --- Delegação de Eventos para Células ---
document.getElementById('cellGrid').addEventListener('click', function(event) {
    const target = event.target;
    const cellElement = target.closest('.cell'); 
    if (cellElement) {
        const cellNumber = parseInt(cellElement.dataset.cellNumber);
        
        if (currentCell === cellNumber) { // Se clicou na célula já ativa
            togglePlayPause(); // Alterna entre play/pause
        } else { // Se clicou numa nova célula
            playAudio(cellNumber); // Inicia a reprodução da nova célula
        }
    }
});
