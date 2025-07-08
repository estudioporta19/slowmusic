// --- Variáveis Globais ---
let audioContext = null;
let sourceNode;
let soundtouchWorkletNode;
let audioBuffer; // Buffer do ficheiro atualmente ativo

let isPlaying = false;
let seekPosition = 0;
let playbackStartTime = 0;

let loopA = 0;
let loopB = 0;
let loopEnabled = false;

let animationFrameId;

// --- Variáveis Globais para Loops Guardados ---
let savedLoops = []; // Cada item: { name, loopA, loopB, fileName, speed, pitch }
const LOOP_STORAGE_KEY = 'soundtouch_saved_loops';

// --- Variáveis Globais para Múltiplos Ficheiros ---
let audioFiles = []; // Array de { name, buffer, originalFile }
let activeFileIndex = -1;

// --- Variáveis para Marcadores ---
let markers = []; // Array para armazenar { name: "Nome", time: 123.45 }

// --- Elementos do DOM ---
const audioFileEl = document.getElementById('audioFile');
const fileInfoEl = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const loadingStatusEl = document.getElementById('loadingStatus');
const controlsEl = document.getElementById('controls'); // Esta é a div geral de controlo
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const playBtn = document.getElementById('playBtn');

const waveformCanvas = document.getElementById('waveformCanvas');
const waveformCtx = waveformCanvas.getContext('2d');
const loopAValueEl = document.getElementById('loopAValue');
const loopBValueEl = document.getElementById('loopBValue');
const loopIndicatorA = document.getElementById('loopIndicatorA');
const loopIndicatorB = document.getElementById('loopIndicatorB');
const playbackIndicator = document.getElementById('playbackIndicator');
const toggleLoopBtn = document.getElementById('toggleLoopBtn');

const loopNameInput = document.getElementById('loopNameInput');
const saveLoopBtn = document.getElementById('saveLoopBtn');
const savedLoopsListEl = document.getElementById('savedLoopsList');

const fileListContainer = document.getElementById('fileListContainer');

// --- NOVOS ELEMENTOS DO DOM para o botão "Fechar Todos" e outros ---
const closeAllFilesBtn = document.getElementById('closeAllFilesBtn');
// Assumindo que 'fileInput' é o mesmo que 'audioFileEl' e 'controlsDiv' é o mesmo que 'controlsEl'
const fileInput = document.getElementById('audioFile'); // Ou o ID real do seu input type="file"
const controlsDiv = document.getElementById('controls'); // A div que contém todos os sliders e botões

// Botões de Reset para consistência (se existirem no HTML, adicione as referências aqui)
const resetSpeedBtn = document.getElementById('resetSpeedBtn'); // Adicione ID no HTML se não tiver
const resetPitchBtn = document.getElementById('resetPitchBtn'); // Adicione ID no HTML se não tiver
const resetLoopABtn = document.getElementById('resetLoopABtn'); // Adicione ID no HTML se não tiver
const addMarkerBtn = document.getElementById('addMarkerBtn'); // Adicione ID no HTML se não tiver
const prevMarkerBtn = document.getElementById('prevMarkerBtn'); // Adicione ID no HTML se não tiver
const nextMarkerBtn = document.getElementById('nextMarkerBtn'); // Adicione ID no HTML se não tiver


// --- Elementos HTML para Marcadores ---
const markerNameInput = document.getElementById('markerNameInput');
const markersListEl = document.getElementById('markersList');


// --- Funções Auxiliares ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00.000';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const s = Math.floor(remainingSeconds);
    const ms = Math.floor((remainingSeconds - s) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// --- Nova Função: Limpar e Redefinir a Aplicação ---
function resetApplicationState() {
    // Parar a reprodução, se estiver a tocar
    stopPlayback(); // Usa a função existente stopPlayback

    isPlaying = false;
    playBtn.textContent = '▶️ Iniciar Reprodução';
    playBtn.disabled = true; // Desativar o botão de reprodução

    // Limpar o array de ficheiros carregados
    audioFiles = []; // Mudei de 'loadedFiles' para 'audioFiles' para corresponder ao seu código
    activeFileIndex = -1;
    audioBuffer = null;

    // Limpar a lista de ficheiros no DOM
    fileListContainer.innerHTML = '';
    fileListContainer.style.display = 'none'; // Oculta o container de ficheiros

    // Ocultar os controlos (volume, pitch, etc.)
    controlsDiv.style.display = 'none'; // Usa controlsDiv que é o seu controlsEl

    // Limpar o waveform
    if (waveformCanvas) {
        waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        waveformCanvas.style.backgroundColor = 'transparent'; // Remove a cor de fundo do waveform
        waveformCanvas.style.border = '1px dashed rgba(255, 255, 255, 0.3)'; // Restaura o estilo da borda
    }
    // Assumindo que você tem um container para o waveform que pode ser ocultado
    // Se não tiver um, ajuste para apenas limpar o canvas.
    // waveformContainer.style.display = 'none'; // Descomente se tiver um container

    // Redefinir valores dos sliders para o padrão (se aplicável, ou desativá-los)
    resetSpeed();
    resetPitch();
    resetLoopA();
    resetLoopB();
    
    // Assegura que o texto de loop está correto e o estilo
    loopEnabled = false;
    toggleLoopBtn.textContent = 'Loop OFF ❌';
    toggleLoopBtn.style.background = 'linear-gradient(45deg, #6c757d, #5a6268)';


    // Desativar botões de reset e outros que dependam de ficheiros carregados
    if (resetSpeedBtn) resetSpeedBtn.disabled = true;
    if (resetPitchBtn) resetPitchBtn.disabled = true;
    if (resetLoopABtn) resetLoopABtn.disabled = true; // Botão de resetar A e B juntos se tiver
    toggleLoopBtn.disabled = true;
    saveLoopBtn.disabled = true;
    if (addMarkerBtn) addMarkerBtn.disabled = true;
    if (prevMarkerBtn) prevMarkerBtn.disabled = true;
    if (nextMarkerBtn) nextMarkerBtn.disabled = true;


    // Ocultar informações do ficheiro
    fileInfoEl.textContent = 'Nenhum ficheiro carregado.';
    fileInfoEl.style.display = 'none'; // Oculta completamente a informação do ficheiro

    // Desativar o botão "Fechar Todos os Ficheiros" após a ação
    closeAllFilesBtn.disabled = true;

    // Limpar lista de loops guardados para o arquivo atual ou todos se desejar
    // Por padrão, esta função apenas limpa os loops do localStorage
    // Se você quiser limpar a interface dos loops salvos sem remover do localStorage:
    renderSavedLoops(); // Atualiza a renderização, pode não limpar o array salvo
    // Se quiser limpar todos os loops salvos do localStorage também:
    // savedLoops = [];
    // saveLoopsToLocalStorage();
    // renderSavedLoops();
    
    // Limpar os marcadores
    markers = [];
    renderMarkers();

    console.log('Todos os ficheiros foram fechados e o estado da aplicação foi redefinido.');
}


audioFileEl.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    stopPlayback();

    fileInfoEl.style.display = 'block';
    loadingStatusEl.style.display = 'block';
    loadingStatusEl.textContent = 'A carregar e descodificar múltiplos ficheiros...';
    controlsEl.style.display = 'none';

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext inicializado. Estado:', audioContext.state);
        try {
            await audioContext.audioWorklet.addModule('./soundtouch-worklet.js');
            console.log('AudioWorklet "scheduled-soundtouch-worklet" carregado com sucesso.');
        } catch (error) {
            console.error('Erro ao carregar AudioWorklet:', error);
            loadingStatusEl.textContent = 'Erro fatal: Não foi possível carregar o processador de áudio!';
            return;
        }
    }

    let loadedCount = 0;
    const totalFiles = files.length;

    // Limpa a lista de ficheiros anterior se novos ficheiros forem carregados
    // Isso garante que, ao adicionar novos ficheiros, os antigos sejam substituídos
    // Se quiser que novos ficheiros sejam adicionados aos existentes, remova esta linha
    // e ajuste a lógica de `selectFile` para lidar com múltiplos
    audioFiles = [];
    activeFileIndex = -1;

    // Desativar o botão "Fechar Todos os Ficheiros" durante o carregamento
    closeAllFilesBtn.disabled = true;


    for (const file of files) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const buffer = await audioContext.decodeAudioData(event.target.result);
                console.log(`Ficheiro '${file.name}' descodificado. Duração: ${buffer.duration} segundos.`);

                audioFiles.push({
                    name: file.name,
                    buffer: buffer,
                    originalFile: file
                });
                loadedCount++;
                loadingStatusEl.textContent = `A carregar e descodificar... (${loadedCount}/${totalFiles}) ${file.name}`;

                if (loadedCount === totalFiles) {
                    console.log('Todos os ficheiros foram carregados e descodificados.');
                    renderFileList();
                    loadingStatusEl.textContent = 'Todos os ficheiros prontos!';
                    setTimeout(() => { loadingStatusEl.style.display = 'none'; }, 2000);
                    fileListContainer.style.display = 'grid';
                    controlsEl.style.display = 'block';
                    if (audioFiles.length > 0 && activeFileIndex === -1) {
                        // Se há ficheiros mas nenhum selecionado, seleciona o primeiro por padrão
                        selectFile(0);
                    } else if (audioFiles.length > 0) {
                        // Se já havia ficheiros e o usuário adicionou mais, manter o foco no último adicionado
                        selectFile(audioFiles.length - 1);
                    }
                    // Chama renderSavedLoops() para atualizar o estado dos botões "Aplicar"
                    // depois que todos os ficheiros são carregados.
                    renderSavedLoops();
                    // Ativar o botão "Fechar Todos os Ficheiros" após o carregamento
                    closeAllFilesBtn.disabled = false;
                }
            } catch (error) {
                console.error(`Erro ao descodificar áudio para '${file.name}':`, error);
                loadingStatusEl.textContent = `Erro ao carregar ficheiro: ${file.name}!`;
                // Se um ficheiro falhar, ainda podemos querer ativar o botão fechar todos se outros carregaram
                if (loadedCount === totalFiles) {
                    closeAllFilesBtn.disabled = (audioFiles.length === 0);
                }
            }
        };
        reader.readAsArrayBuffer(file);
    }
});

function renderFileList() {
    fileListContainer.innerHTML = '';
    if (audioFiles.length === 0) {
        fileListContainer.style.display = 'none';
        return;
    }

    audioFiles.forEach((file, index) => {
        const fileCell = document.createElement('div');
        fileCell.className = 'file-cell';
        fileCell.dataset.index = index;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'file-cell-remove';
        removeBtn.textContent = 'X';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFile(index);
        };
        fileCell.style.position = 'relative';
        fileCell.appendChild(removeBtn);

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = file.name;
        fileCell.appendChild(fileNameSpan);

        if (index === activeFileIndex) {
            fileCell.classList.add('selected');
        }

        // ALTERAÇÃO AQUI: Chamar handleFileClick em vez de selectFile diretamente
        fileCell.addEventListener('click', () => handleFileClick(index));
        fileListContainer.appendChild(fileCell);
    });
}

function removeFile(index) {
    if (!confirm(`Tem a certeza que deseja remover o ficheiro "${audioFiles[index].name}"?`)) {
        return;
    }

    stopPlayback();

    const removedFileName = audioFiles[index].name;
    audioFiles.splice(index, 1);

    // Remove loops guardados que pertenciam a este ficheiro
    savedLoops = savedLoops.filter(loop => loop.fileName !== removedFileName);
    saveLoopsToLocalStorage(); // Salva a lista de loops atualizada

    if (audioFiles.length === 0) {
        // Se não houver mais ficheiros, redefina completamente o estado
        resetApplicationState();
    } else if (index === activeFileIndex) {
        // Se o ficheiro removido era o ativo, seleciona o primeiro ficheiro restante
        selectFile(0);
    } else if (index < activeFileIndex) {
        // Se um ficheiro anterior ao ativo foi removido, ajusta o índice do ficheiro ativo
        activeFileIndex--;
    }

    renderFileList();
    renderSavedLoops(); // Atualiza também a lista de loops guardados
    console.log(`Ficheiro removido. Ficheiros restantes: ${audioFiles.length}`);

    // Garante que o botão "Fechar Todos" está ativado se ainda houver ficheiros
    closeAllFilesBtn.disabled = (audioFiles.length === 0);
}

// NOVA FUNÇÃO: Lida com o clique no nome do ficheiro
async function handleFileClick(index) {
    // Se o ficheiro clicado já é o ficheiro ativo
    if (index === activeFileIndex) {
        // Alternar reprodução (tocar/pausar)
        await togglePlayback();
    } else {
        // Se for um novo ficheiro, seleciona-o e inicia a reprodução
        await selectFile(index);
        startPlayback(); // Inicia a reprodução automaticamente após a seleção
    }
}

async function selectFile(index) {
    // Se já está selecionado e o buffer está carregado, não faz nada
    if (index === activeFileIndex && audioBuffer === audioFiles[index].buffer) {
        return;
    }

    // Parar qualquer reprodução ativa antes de carregar um novo ficheiro
    if (isPlaying) {
        stopPlayback();
    }
    seekPosition = 0; // Reinicia a posição de busca ao selecionar um novo ficheiro
    resetControls(); // Reinicia sliders e loops

    // --- MUDANÇA AQUI: Limpa os marcadores e os renderiza novamente ---
    markers = [];           // Limpa o array de marcadores
    renderMarkers();        // Atualiza a UI para mostrar uma lista vazia de marcadores
    // -----------------------------------------------------------------

    activeFileIndex = index;
    // O áudioBuffer é definido aqui, vindo do array audioFiles
    audioBuffer = audioFiles[activeFileIndex].buffer;
    fileNameEl.textContent = `Ficheiro: ${audioFiles[activeFileIndex].name}`;

    // Atualiza a seleção visual
    document.querySelectorAll('.file-cell').forEach((cell) => {
        if (parseInt(cell.dataset.index) === activeFileIndex) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    });

    drawWaveform(audioBuffer);
    loopB = audioBuffer.duration;
    loopBValueEl.textContent = formatTime(loopB);
    updateLoopIndicators();

    // Habilita o botão de play e outros controlos após a seleção
    playBtn.disabled = false;
    saveLoopBtn.disabled = false;
    toggleLoopBtn.disabled = false;
    if (resetSpeedBtn) resetSpeedBtn.disabled = false;
    if (resetPitchBtn) resetPitchBtn.disabled = false;
    if (resetLoopABtn) resetLoopABtn.disabled = false;
    if (addMarkerBtn) addMarkerBtn.disabled = false;
    if (prevMarkerBtn) prevMarkerBtn.disabled = false;
    if (nextMarkerBtn) nextMarkerBtn.disabled = false;

    fileInfoEl.textContent = `Ficheiro selecionado: ${audioFiles[activeFileIndex].name} (${formatTime(audioBuffer.duration)})`;
    fileInfoEl.classList.remove('loading');

    console.log(`Ficheiro '${audioFiles[activeFileIndex].name}' selecionado.`);
}

async function togglePlayback() {
    if (!audioBuffer) {
        alert('Por favor, carregue e selecione um ficheiro de áudio primeiro.');
        return;
    }

    if (audioContext && audioContext.state === 'suspended') {
        console.log('Tentando retomar AudioContext...');
        try {
            await audioContext.resume();
            console.log('AudioContext retomado com sucesso. Estado:', audioContext.state);
        } catch (e) {
            console.error('Erro ao retomar AudioContext:', e);
            alert('Não foi possível iniciar a reprodução. Por favor, interaja com a página (clique) e tente novamente.');
            return;
        }
    }

    if (isPlaying) {
        pausePlayback();
    } else {
        await startPlayback();
    }
}

async function startPlayback() {
    if (isPlaying || !audioBuffer) return;

    if (!audioContext) {
        console.error('AudioContext não inicializado. Carregue um ficheiro de áudio primeiro.');
        return;
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    soundtouchWorkletNode = new AudioWorkletNode(audioContext, 'scheduled-soundtouch-worklet');
    console.log('AudioWorkletNode criado.');

    sourceNode.connect(soundtouchWorkletNode);
    soundtouchWorkletNode.connect(audioContext.destination);
    console.log('sourceNode e soundtouchWorkletNode conectados ao destino.');

    const leftChannelData = audioBuffer.getChannelData(0).slice();
    const rightChannelData = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1).slice() : audioBuffer.getChannelData(0).slice();

    const bufferProps = {
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        length: audioBuffer.length,
        duration: audioBuffer.duration
    };

    // --- CORREÇÃO APLICADA AQUI: ENVIAR 'detail' COMO UM ARRAY ---
    soundtouchWorkletNode.port.postMessage({
        message: 'INITIALIZE_PROCESSOR',
        detail: [
            bufferProps,
            leftChannelData,
            rightChannelData
        ]
    }, [leftChannelData.buffer, rightChannelData.buffer]);

    let startSample;
    let durationSamples;

    if (loopEnabled) {
        startSample = Math.round(loopA * audioBuffer.sampleRate);
        durationSamples = Math.round((loopB - loopA) * audioBuffer.sampleRate);
        if (durationSamples <= 0) {
            durationSamples = Math.round(0.1 * audioBuffer.sampleRate);
        }
    } else {
        startSample = Math.round(seekPosition * audioBuffer.sampleRate);
        durationSamples = audioBuffer.length - startSample;
    }

    soundtouchWorkletNode.parameters.get('offsetSamples').value = startSample;
    soundtouchWorkletNode.parameters.get('playbackDurationSamples').value = durationSamples;

    const actualSourceNodeStartOffset = loopEnabled ? loopA : seekPosition;

    soundtouchWorkletNode.port.onmessage = (event) => {
        if (event.data.message === 'PROCESSOR_READY') {
            console.log('Worklet processador inicializado e pronto.');
            updateSoundTouchSettings();

            sourceNode.start(0, actualSourceNodeStartOffset);
            playbackStartTime = audioContext.currentTime;
            isPlaying = true;
            updatePlayButton();
            animatePlaybackIndicator();

        } else if (event.data.data && event.data.data.message === 'PROCESSOR_END') {
            console.log('Reprodução terminada pelo processador (Worklet).');
            if (loopEnabled && audioContext && soundtouchWorkletNode) {
                seekPosition = loopA;
                console.log(`Looped to A: ${formatTime(loopA)}`);
                stopPlayback();
                startPlayback();
            } else {
                stopPlayback();
            }
        }
    };

    sourceNode.onended = () => {
        console.log('SourceNode terminou.');
        if (isPlaying && !loopEnabled) {
            stopPlayback();
        }
    };
}

function pausePlayback() {
    if (!isPlaying || !sourceNode) return;

    cancelAnimationFrame(animationFrameId);

    let currentPlaybackTimeInOriginalAudio;
    if (soundtouchWorkletNode && audioBuffer) {
        const elapsedProcessedTime = (audioContext.currentTime - playbackStartTime) * soundtouchWorkletNode.parameters.get('tempo').value;
        const startOffsetForProcessing = loopEnabled ? loopA : seekPosition;
        currentPlaybackTimeInOriginalAudio = startOffsetForProcessing + elapsedProcessedTime;
    } else {
        currentPlaybackTimeInOriginalAudio = seekPosition + (audioContext.currentTime - playbackStartTime);
    }

    seekPosition = currentPlaybackTimeInOriginalAudio;
    seekPosition = Math.min(Math.max(0, seekPosition), audioBuffer.duration);

    stopPlayback();
    isPlaying = false;
    updatePlayButton();
}

function stopPlayback() {
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = null;
    }
    if (soundtouchWorkletNode) {
        soundtouchWorkletNode.port.postMessage({ message: 'STOP' });
        soundtouchWorkletNode.disconnect();
        soundtouchWorkletNode = null;
    }
    cancelAnimationFrame(animationFrameId);
    playbackIndicator.style.display = 'none';
    isPlaying = false;
    updatePlayButton();
    updateLoopIndicators();
}

function updatePlayButton() {
    playBtn.textContent = isPlaying ? '⏸️ Pausar' : '▶️ Reproduzir';
}

function updateSoundTouchSettings() {
    if (!soundtouchWorkletNode) return;

    const speed = parseFloat(speedSlider.value);
    const semitones = parseInt(pitchSlider.value);

    soundtouchWorkletNode.parameters.get('tempo').value = speed;
    soundtouchWorkletNode.parameters.get('pitchSemitones').value = semitones;
}

speedSlider.addEventListener('input', () => {
    const speed = parseFloat(speedSlider.value);
    speedValue.textContent = `${speed.toFixed(1)}x`;
    updateSoundTouchSettings();
});

pitchSlider.addEventListener('input', () => {
    const semitones = parseInt(pitchSlider.value);
    const label = semitones > 0 ? `+${semitones}` : semitones;
    pitchValue.textContent = `${label} semitons`;
    updateSoundTouchSettings();
});

function resetSpeed() {
    speedSlider.value = 1;
    speedValue.textContent = '1.0x';
    updateSoundTouchSettings();
}

function resetPitch() {
    pitchSlider.value = 0;
    pitchValue.textContent = '0 semitons';
    updateSoundTouchSettings();
}

function resetControls() {
    resetSpeed();
    resetPitch();
    stopPlayback();

    if (audioBuffer) {
        resetLoopB();
    } else {
        loopB = 0;
        loopBValueEl.textContent = formatTime(0);
    }
    resetLoopA();
    loopEnabled = false;
    toggleLoopBtn.textContent = 'Loop OFF ❌';
    toggleLoopBtn.style.background = 'linear-gradient(45deg, #6c757d, #5a6268)';
    updateLoopIndicators();
}

function drawWaveform(buffer) {
    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    if (!buffer) return;

    const channelData = buffer.getChannelData(0);
    const samplesPerPixel = Math.floor(channelData.length / waveformCanvas.width);
    const centerY = waveformCanvas.height / 2;
    const amplitude = waveformCanvas.height / 2;

    waveformCtx.lineWidth = 1;
    waveformCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, centerY);

    for (let x = 0; x < waveformCanvas.width; x++) {
        let sum = 0;
        let min = 0;
        let max = 0;
        for (let i = 0; i < samplesPerPixel; i++) {
            const sample = channelData[x * samplesPerPixel + i];
            sum += sample;
            min = Math.min(min, sample);
            max = Math.max(max, sample);
        }
        waveformCtx.lineTo(x, centerY + (max * amplitude));
        waveformCtx.lineTo(x, centerY + (min * amplitude));
        waveformCtx.moveTo(x, centerY + (max * amplitude));
    }
    waveformCtx.stroke();

    updateLoopIndicators();
}

function updateLoopIndicators() {
    if (!audioBuffer) {
        loopIndicatorA.style.display = 'none';
        loopIndicatorB.style.display = 'none';
        playbackIndicator.style.display = 'none';
        return;
    }

    const totalDuration = audioBuffer.duration;

    const percentA = (loopA / totalDuration) * 100;
    loopIndicatorA.style.left = `${percentA}%`;
    loopIndicatorA.style.display = 'block';

    const percentB = (loopB / totalDuration) * 100;
    loopIndicatorB.style.left = `${percentB}%`;
    loopIndicatorB.style.display = 'block';

    if (isPlaying && audioContext) {
        const currentTempo = soundtouchWorkletNode ? soundtouchWorkletNode.parameters.get('tempo').value : 1.0;
        const elapsed = audioContext.currentTime - playbackStartTime;
        const currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);

        const percentPlayback = (currentPlaybackTime / totalDuration) * 100;

        if (loopEnabled) {
            const loopBPercent = (loopB / totalDuration) * 100;
            playbackIndicator.style.left = `${Math.min(percentPlayback, loopBPercent)}%`;
        } else {
            playbackIndicator.style.left = `${percentPlayback}%`;
        }
        playbackIndicator.style.display = 'block';
    } else {
        playbackIndicator.style.display = 'none';
    }
}

waveformCanvas.addEventListener('click', (e) => {
    // Sai da função se não houver um ficheiro de áudio carregado.
    if (!audioBuffer) return;

    // Calcula a posição do clique na waveform e o tempo correspondente no áudio.
    const rect = waveformCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left; // Posição X do clique dentro do canvas
    const percent = clickX / waveformCanvas.width;
    const clickedTime = percent * audioBuffer.duration;

    // Para a reprodução atual para que possamos reiniciar no novo ponto.
    // É importante parar e reiniciar para que o AudioWorkletNode possa ser reconfigurado.
    const wasPlaying = isPlaying; // Guarda o estado antes de parar
    stopPlayback();

    // Define a nova posição de busca no áudio.
    seekPosition = clickedTime;
    console.log(`Posição de busca definida para: ${formatTime(seekPosition)}`);

    // Se o áudio estava a tocar, reinicia a reprodução do novo ponto.
    if (wasPlaying) {
        startPlayback();
    } else {
        // Se o áudio estava parado, apenas move o indicador visual de reprodução
        // para a nova posição.
        updateLoopIndicators();
    }
});

const FINE_TUNE_STEP = 0.01; // Ajuste fino em segundos (10 milissegundos)

function adjustLoop(loopPoint, adjustment) {
    if (!audioBuffer) {
        alert('Por favor, carregue e selecione um ficheiro de áudio primeiro.');
        return;
    }

    let newLoopValue;
    if (loopPoint === 'A') {
        newLoopValue = loopA + adjustment;
        // Limitar A para não ser menor que 0 e não ser maior que B
        loopA = Math.max(0, Math.min(newLoopValue, loopB - 0.001)); // -0.001 para garantir A < B
        loopAValueEl.textContent = formatTime(loopA);
    } else if (loopPoint === 'B') {
        newLoopValue = loopB + adjustment;
        // Limitar B para não ser maior que a duração total e não ser menor que A
        loopB = Math.min(audioBuffer.duration, Math.max(newLoopValue, loopA + 0.001)); // +0.001 para garantir B > A
        loopBValueEl.textContent = formatTime(loopB);
    }

    updateLoopIndicators();

    // Se o loop estiver ativo e a reprodução estiver a decorrer,
    // reiniciar a reprodução para aplicar imediatamente o novo ponto.
    if (loopEnabled && isPlaying) {
        seekPosition = loopA; // Sempre começa do A quando o loop está ativo
        stopPlayback();
        startPlayback();
    } else if (loopPoint === 'A' && !isPlaying) {
        // Se ajustar A enquanto parado, move o indicador de reprodução para A
        seekPosition = loopA;
        updateLoopIndicators();
    } else if (loopPoint === 'B' && !isPlaying) {
        // Se ajustar B enquanto parado, e a posição atual estiver dentro do loop,
        // mas não iniciar a reprodução. Apenas atualiza indicadores.
    }
}

function adjustLoopA(adjustment) {
    adjustLoop('A', adjustment);
}

function adjustLoopB(adjustment) {
    adjustLoop('B', adjustment);
}

// --- Modificações nas funções existentes para consistência ---

// Pequena refatoração para evitar duplicação de código na lógica de `setLoopA` e `setLoopB`
// Esta função auxiliar vai ser chamada por setLoopA e setLoopB
function updateAndPlayLoop(targetLoopPoint, newTime) {
    if (!audioBuffer || !audioContext) return;

    if (targetLoopPoint === 'A') {
        loopA = Math.min(loopB - 0.001, newTime); // Garante A < B
        loopA = Math.max(0, loopA); // Garante A >= 0
        loopAValueEl.textContent = formatTime(loopA);
    } else if (targetLoopPoint === 'B') {
        loopB = Math.max(loopA + 0.001, newTime); // Garante B > A
        loopB = Math.min(loopB, audioBuffer.duration); // Garante B <= duração
        loopBValueEl.textContent = formatTime(loopB);
    }

    updateLoopIndicators();

    // Se o loop estiver ativo e/ou a reprodução estiver a decorrer, reinicia a reprodução
    if (loopEnabled || isPlaying) { // Se o loop estiver ativo OU se estiver a tocar
        seekPosition = loopA; // Sempre reinicia no A
        stopPlayback();
        startPlayback();
    } else {
        // Se não está a tocar e não está em loop, apenas move o indicador de reprodução
        seekPosition = newTime; // Para que o indicador de reprodução se posicione
        updateLoopIndicators();
    }
}

function setLoopA() {
    let currentPlaybackTime = 0;
    if (isPlaying && soundtouchWorkletNode) {
        const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
        const elapsed = audioContext.currentTime - playbackStartTime;
        currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);
    } else if (audioBuffer) {
        currentPlaybackTime = seekPosition;
    }
    updateAndPlayLoop('A', currentPlaybackTime);
}

function setLoopB() {
    let currentPlaybackTime = 0;
    if (isPlaying && soundtouchWorkletNode) {
        const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
        const elapsed = audioContext.currentTime - playbackStartTime;
        currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);
    } else if (audioBuffer) {
        currentPlaybackTime = seekPosition;
    }
    updateAndPlayLoop('B', currentPlaybackTime);
}

function resetLoopA() {
    if (!audioBuffer) return;
    loopA = 0;
    loopAValueEl.textContent = formatTime(loopA);
    updateLoopIndicators();
}

function resetLoopB() {
    if (!audioBuffer) return;
    loopB = audioBuffer.duration;
    loopBValueEl.textContent = formatTime(loopB);
    updateLoopIndicators();
}

function toggleLoop() {
    loopEnabled = !loopEnabled;
    toggleLoopBtn.textContent = loopEnabled ? 'Loop ON ✅' : 'Loop OFF ❌';
    toggleLoopBtn.style.background = loopEnabled ? 'linear-gradient(45deg, #1abc9c, #16a085)' : 'linear-gradient(45deg, #6c757d, #5a6268)';
    console.log('Loop:', loopEnabled);

    if (loopEnabled && isPlaying) {
        seekPosition = loopA;
        stopPlayback();
        startPlayback();
    } else if (!loopEnabled && isPlaying) {
        stopPlayback();
    }
}

function animatePlaybackIndicator() {
    if (!isPlaying || !audioBuffer || !audioContext || !soundtouchWorkletNode) {
        cancelAnimationFrame(animationFrameId);
        playbackIndicator.style.display = 'none';
        return;
    }

    const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
    const elapsed = audioContext.currentTime - playbackStartTime;

    let currentPlaybackTime;
    if (loopEnabled) {
        const loopDuration = loopB - loopA;
        if (loopDuration <= 0) { // Proteção contra divisão por zero ou duração inválida
            currentPlaybackTime = loopA;
        } else {
            const elapsedInLoopCycle = (elapsed * currentTempo) % loopDuration;
            currentPlaybackTime = loopA + elapsedInLoopCycle;
        }
    } else {
        currentPlaybackTime = seekPosition + (elapsed * currentTempo);
    }

    const totalDuration = audioBuffer.duration;
    const percentPlayback = (currentPlaybackTime / totalDuration) * 100;

    playbackIndicator.style.left = `${percentPlayback}%`;
    playbackIndicator.style.display = 'block';

    animationFrameId = requestAnimationFrame(animatePlaybackIndicator);
}

// --- FUNÇÕES DE GESTÃO DE LOOPS GUARDADOS ---

function loadSavedLoops() {
    const storedLoops = localStorage.getItem(LOOP_STORAGE_KEY);
    if (storedLoops) {
        try {
            savedLoops = JSON.parse(storedLoops);
            renderSavedLoops();
            console.log('Loops carregados:', savedLoops);
        } catch (e) {
            console.error('Erro ao carregar loops do LocalStorage:', e);
            savedLoops = [];
        }
    }
}

function saveLoopsToLocalStorage() {
    localStorage.setItem(LOOP_STORAGE_KEY, JSON.stringify(savedLoops));
    console.log('Loops guardados no LocalStorage.');
}

function saveCurrentLoop() {
    if (!audioBuffer || activeFileIndex === -1) {
        alert('Por favor, carregue e selecione um ficheiro de áudio para guardar um loop.');
        return;
    }

    const name = loopNameInput.value.trim();
    if (!name) {
        alert('Por favor, dê um nome ao loop.');
        return;
    }

    const currentFileName = audioFiles[activeFileIndex].name;

    // --- NOVAS LINHAS AQUI: Captura os valores atuais de speed e pitch ---
    const currentSpeed = parseFloat(speedSlider.value);
    const currentPitch = parseInt(pitchSlider.value);
    // --- FIM DAS NOVAS LINHAS ---

    // Verifica se já existe um loop com o mesmo nome PARA ESTE FICHEIRO
    if (savedLoops.some(loop => loop.name === name && loop.fileName === currentFileName)) {
        if (!confirm(`Um loop com o nome "${name}" já existe para o ficheiro "${currentFileName}". Deseja substituí-lo?`)) {
            return;
        }
        // Se sim, remove o antigo antes de adicionar o novo
        savedLoops = savedLoops.filter(loop => !(loop.name === name && loop.fileName === currentFileName));
    }

    const newLoop = {
        name: name,
        loopA: loopA,
        loopB: loopB,
        fileName: currentFileName,
        speed: currentSpeed, // --- NOVO: Guarda a velocidade ---
        pitch: currentPitch  // --- NOVO: Guarda o tom ---
    };

    savedLoops.push(newLoop);
    saveLoopsToLocalStorage();
    renderSavedLoops();
    loopNameInput.value = '';
    alert(`Loop "${name}" para "${currentFileName}" guardado!`);
}

function removeLoop(index) {
    if (confirm(`Tem a certeza que deseja remover o loop "${savedLoops[index].name}"?`)) {
        savedLoops.splice(index, 1);
        saveLoopsToLocalStorage();
        renderSavedLoops();
    }
}

async function applyLoop(index) {
    if (index < 0 || index >= savedLoops.length) return;

    const loopToApply = savedLoops[index];
    const targetFileName = loopToApply.fileName;

    // Encontra o ficheiro correspondente
    const fileIndex = audioFiles.findIndex(file => file.name === targetFileName);

    if (fileIndex === -1) {
        alert(`O ficheiro "${targetFileName}" associado a este loop não está carregado. Por favor, carregue-o primeiro.`);
        return;
    }

    // Se o ficheiro associado ao loop não for o ficheiro atualmente selecionado,
    // seleciona-o primeiro. Isso vai parar o áudio e redefinir os controlos.
    if (fileIndex !== activeFileIndex) {
        console.log(`Ficheiro "${targetFileName}" encontrado. Selecionando-o...`);
        await selectFile(fileIndex);
    }

    // Agora que o ficheiro está selecionado e os controlos redefinidos, aplica os pontos de loop
    loopA = loopToApply.loopA;
    loopB = loopToApply.loopB;

    loopAValueEl.textContent = formatTime(loopA);
    loopBValueEl.textContent = formatTime(loopB);
    updateLoopIndicators();

    loopEnabled = true; // Ativa o modo de loop
    toggleLoopBtn.textContent = 'Loop ON ✅'; // Atualiza o texto do botão
    toggleLoopBtn.style.background = 'linear-gradient(45deg, #1abc9c, #16a085)'; // Atualiza o estilo do botão

    // --- NOVAS LINHAS AQUI: Aplica os valores de speed e pitch guardados ---
    speedSlider.value = loopToApply.speed !== undefined ? loopToApply.speed : 1.0; // Usa 1.0 como padrão se não existir
    pitchSlider.value = loopToApply.pitch !== undefined ? loopToApply.pitch : 0;    // Usa 0 como padrão se não existir
    speedValue.textContent = `${parseFloat(speedSlider.value).toFixed(1)}x`;
    pitchValue.textContent = `${parseInt(pitchSlider.value) > 0 ? '+' : ''}${parseInt(pitchSlider.value)} semitons`;
    updateSoundTouchSettings(); // Chama para aplicar as novas configurações ao AudioWorkletNode
    // --- FIM DAS NOVAS LINHAS ---

    alert(`Loop "${loopToApply.name}" para "${loopToApply.fileName}" aplicado e a reproduzir!`);

    // Inicia a reprodução a partir do ponto A do loop
    seekPosition = loopA;
    stopPlayback();
    startPlayback();
}

function renderSavedLoops() {
    savedLoopsListEl.innerHTML = '';

    if (savedLoops.length === 0) {
        savedLoopsListEl.innerHTML = '<li style="color: rgba(255,255,255,0.7); text-align: center; padding: 10px;">Nenhum loop guardado.</li>';
        return;
    }

    savedLoops.forEach((loop, index) => {
        const li = document.createElement('li');
        li.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
        if (index === savedLoops.length - 1) {
            li.style.borderBottom = 'none';
        }

        const loopNameAndFile = document.createElement('span');
        loopNameAndFile.innerHTML = `<strong>${loop.name}</strong> <small>(${loop.fileName})</small>`;
        loopNameAndFile.style.marginBottom = '5px';
        li.appendChild(loopNameAndFile);

        const loopDetails = document.createElement('span');
        loopDetails.textContent = `${formatTime(loop.loopA)} - ${formatTime(loop.loopB)}`;
        loopDetails.style.fontSize = '0.9em';
        loopDetails.style.color = 'rgba(255,255,255,0.8)';
        li.appendChild(loopDetails);

        if (loop.speed !== undefined || loop.pitch !== undefined) {
            const speedPitchDetails = document.createElement('span');
            let detailsText = '';
            if (loop.speed !== undefined) {
                detailsText += `Velocidade: ${parseFloat(loop.speed).toFixed(1)}x`;
            }
            if (loop.pitch !== undefined) {
                if (detailsText) detailsText += ' | ';
                detailsText += `Tom: ${parseInt(loop.pitch) > 0 ? '+' : ''}${parseInt(loop.pitch)} semitons`;
            }
            speedPitchDetails.textContent = detailsText;
            speedPitchDetails.style.fontSize = '0.8em';
            speedPitchDetails.style.color = 'rgba(255,255,255,0.6)';
            speedPitchDetails.style.marginTop = '3px';
            li.appendChild(speedPitchDetails);
        }

        // --- NOVA LÓGICA AQUI: Verifica se o ficheiro está carregado e adiciona um aviso ---
        const isFileLoaded = audioFiles.some(file => file.name === loop.fileName);
        if (!isFileLoaded) {
            const fileMissingWarning = document.createElement('span');
            fileMissingWarning.textContent = 'Ficheiro não carregado ⚠️';
            fileMissingWarning.style.fontSize = '0.75em';
            fileMissingWarning.style.color = '#ffc107'; // Cor de aviso (amarelo)
            fileMissingWarning.style.marginTop = '5px';
            li.appendChild(fileMissingWarning);
        }
        // --- FIM DA NOVA LÓGICA ---

        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.marginTop = '8px';
        buttonsDiv.style.alignSelf = 'flex-end';

        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Aplicar';
        applyBtn.className = 'reset-btn';
        applyBtn.style.background = 'linear-gradient(45deg, #28a745, #218838)';
        applyBtn.style.marginRight = '5px';
        applyBtn.onclick = () => applyLoop(savedLoops.indexOf(loop));

        // Desabilita o botão "Aplicar" se o ficheiro não estiver carregado
        if (!isFileLoaded) {
            applyBtn.disabled = true;
            applyBtn.style.opacity = '0.5';
            applyBtn.style.cursor = 'not-allowed';
        }

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'X';
        removeBtn.className = 'reset-btn';
        removeBtn.style.background = 'linear-gradient(45deg, #dc3545, #c82333)';
        removeBtn.onclick = () => removeLoop(savedLoops.indexOf(loop));

        buttonsDiv.appendChild(applyBtn);
        buttonsDiv.appendChild(removeBtn);

        li.appendChild(buttonsDiv);
        savedLoopsListEl.appendChild(li);
    });
}

// --- FUNÇÕES PARA MARCADORES ---

function addMarker() {
    if (!audioBuffer) {
        alert('Por favor, carregue e selecione um ficheiro de áudio primeiro.');
        return;
    }

    let markerName = markerNameInput.value.trim();
    if (!markerName) {
        markerName = `Marcador ${markers.length + 1}`; // Nome padrão se não for fornecido
    }

    let currentPlaybackTime = 0;
    if (isPlaying && soundtouchWorkletNode) {
        const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
        const elapsed = audioContext.currentTime - playbackStartTime;
        currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);
    } else if (audioBuffer) {
        currentPlaybackTime = seekPosition;
    }

    // Adicionar o marcador
    markers.push({ name: markerName, time: currentPlaybackTime });
    // Ordenar os marcadores por tempo
    markers.sort((a, b) => a.time - b.time);

    renderMarkers(); // Atualizar a lista visual
    markerNameInput.value = ''; // Limpar o input
}

function renderMarkers() {
    markersListEl.innerHTML = ''; // Limpar a lista atual

    if (markers.length === 0) {
        markersListEl.innerHTML = '<li style="color: rgba(255,255,255,0.7); text-align: center; padding: 10px;">Nenhum marcador guardado ainda.</li>';
        return;
    }

    markers.forEach((marker, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="marker-time">${formatTime(marker.time)}</span>
            <span class="marker-name">${marker.name}</span>
            <button class="delete-marker-btn" data-index="${index}">❌</button>
        `;
        li.onclick = () => navigateToMarker(marker.time); // Navegar ao clicar no item

        // Adicionar listener para o botão de eliminar
        li.querySelector('.delete-marker-btn').onclick = (e) => {
            e.stopPropagation(); // Previne que o clique no botão ative o clique no LI
            deleteMarker(index);
        };

        markersListEl.appendChild(li);
    });
}

function navigateToMarker(time) {
    if (!audioBuffer) {
        alert('Por favor, carregue e selecione um ficheiro de áudio primeiro.');
        return;
    }

    // Guarda o estado de reprodução atual para decidir se deve recomeçar a tocar
    const wasPlayingBeforeNavigation = isPlaying;

    stopPlayback(); // Para a reprodução atual
    seekPosition = time; // Define a nova posição de busca
    updateLoopIndicators(); // Atualiza o indicador visual na waveform para a nova posição

    // Se estava a tocar antes de navegar, inicia a reprodução automaticamente após saltar
    if (wasPlayingBeforeNavigation) {
        startPlayback();
    }
}

function deleteMarker(index) {
    markers.splice(index, 1); // Remove o marcador do array
    renderMarkers(); // Atualiza a lista visual
}

function navigateToPreviousMarker() {
    if (!audioBuffer || markers.length === 0) return;

    let currentPlaybackTime = 0;
    if (isPlaying && soundtouchWorkletNode) {
        const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
        const elapsed = audioContext.currentTime - playbackStartTime;
        currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);
    } else if (audioBuffer) { // Se não estiver a tocar, usa a seekPosition atual
        currentPlaybackTime = seekPosition;
    }

    // Encontra o marcador anterior mais próximo
    let prevMarker = null;
    for (let i = markers.length - 1; i >= 0; i--) {
        // Encontra o último marcador que é significativamente anterior à posição atual
        if (markers[i].time < currentPlaybackTime - 0.05) { // -0.05 para evitar o marcador atual
            prevMarker = markers[i];
            break;
        }
    }

    if (prevMarker) {
        navigateToMarker(prevMarker.time);
    } else {
        // Se não houver anterior, vai para o último marcador (ciclo)
        navigateToMarker(markers[markers.length - 1].time);
    }
}

function navigateToNextMarker() {
    if (!audioBuffer || markers.length === 0) return;

    let currentPlaybackTime = 0;
    if (isPlaying && soundtouchWorkletNode) {
        const currentTempo = soundtouchWorkletNode.parameters.get('tempo').value;
        const elapsed = audioContext.currentTime - playbackStartTime;
        currentPlaybackTime = (loopEnabled ? loopA : seekPosition) + (elapsed * currentTempo);
    } else if (audioBuffer) { // Se não estiver a tocar, usa a seekPosition atual
        currentPlaybackTime = seekPosition;
    }

    // Encontra o próximo marcador mais próximo
    let nextMarker = null;
    for (let i = 0; i < markers.length; i++) {
        // Encontra o primeiro marcador que é significativamente posterior à posição atual
        if (markers[i].time > currentPlaybackTime + 0.05) { // +0.05 para evitar o marcador atual
            nextMarker = markers[i];
            break;
        }
    }

    if (nextMarker) {
        navigateToMarker(nextMarker.time);
    } else {
        // Se não houver próximo, vai para o primeiro marcador (ciclo)
        navigateToMarker(markers[0].time);
    }
}


// --- Event Listeners dos Botões ---
// Certifique-se de que estes botões existem no seu HTML com os IDs correspondentes
if (playBtn) playBtn.addEventListener('click', togglePlayback);
if (toggleLoopBtn) toggleLoopBtn.addEventListener('click', toggleLoop);
if (saveLoopBtn) saveLoopBtn.addEventListener('click', saveCurrentLoop);
if (closeAllFilesBtn) closeAllFilesBtn.addEventListener('click', resetApplicationState);
if (resetSpeedBtn) resetSpeedBtn.addEventListener('click', resetSpeed);
if (resetPitchBtn) resetPitchBtn.addEventListener('click', resetPitch);
// Adicione um event listener para um botão que resete A e B, se tiver
if (resetLoopABtn) resetLoopABtn.addEventListener('click', () => { resetLoopA(); resetLoopB(); });
if (addMarkerBtn) addMarkerBtn.addEventListener('click', addMarker);
if (prevMarkerBtn) prevMarkerBtn.addEventListener('click', navigateToPreviousMarker);
if (nextMarkerBtn) nextMarkerBtn.addEventListener('click', navigateToNextMarker);


// --- Inicialização ao carregar o DOM ---
document.addEventListener('DOMContentLoaded', () => {
    loadSavedLoops(); // Carrega os loops guardados
    renderMarkers(); // Renderiza a lista de marcadores (vazia ou com dados carregados se implementar persistência)

    // Desativar o botão "Fechar Todos os Ficheiros" e outros controlos no carregamento inicial
    // se não houver ficheiros previamente carregados (que não é o caso padrão do navegador).
    resetApplicationState(); // Chama para definir o estado inicial correto dos botões e UI
});


document.addEventListener('keydown', (e) => {
    // Ignora eventos de teclado se o utilizador estiver a escrever num input (ex: nome do loop)
    // ou se o ficheiro de áudio ainda não tiver sido carregado
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || !audioBuffer) {
        return;
    }

    // Previne o comportamento padrão da tecla (ex: barra de espaço rolar a página)
    e.preventDefault();

    switch (e.code) {
        case 'Space': // Tecla de Espaço
            togglePlayback();
            break;
        case 'KeyA': // Tecla 'A'
            // Verifica se Shift não está pressionado (para não conflitar com Shift+clique no waveform)
            if (!e.shiftKey) {
                setLoopA();
            }
            break;
        case 'KeyB': // Tecla 'B'
            // Verifica se Shift não está pressionado (para não conflitar com Shift+clique no waveform)
            if (!e.shiftKey) {
                setLoopB();
            }
            break;
        case 'ArrowLeft': // Seta para a esquerda
            if (e.shiftKey) { // Shift + Seta Esquerda para ajuste fino A
                adjustLoopA(-FINE_TUNE_STEP);
            } else { // Apenas Seta Esquerda para pular para o marcador anterior
                navigateToPreviousMarker();
            }
            break;
        case 'ArrowRight': // Seta para a direita
            if (e.shiftKey) { // Shift + Seta Direita para ajuste fino B
                adjustLoopB(FINE_TUNE_STEP);
            } else { // Apenas Seta Direita para pular para o próximo marcador
                navigateToNextMarker();
            }
            break;
        case 'ArrowUp': // Seta para cima (ajustar pitch ou speed)
            if (e.shiftKey) { // Shift + Seta Cima (aumentar speed)
                speedSlider.value = Math.min(parseFloat(speedSlider.value) + 0.1, parseFloat(speedSlider.max));
                speedSlider.dispatchEvent(new Event('input')); // Dispara evento de input para atualizar
            } else { // Apenas Seta Cima (aumentar pitch)
                pitchSlider.value = Math.min(parseInt(pitchSlider.value) + 1, parseInt(pitchSlider.max));
                pitchSlider.dispatchEvent(new Event('input')); // Dispara evento de input para atualizar
            }
            break;
        case 'ArrowDown': // Seta para baixo (ajustar pitch ou speed)
            if (e.shiftKey) { // Shift + Seta Baixo (diminuir speed)
                speedSlider.value = Math.max(parseFloat(speedSlider.value) - 0.1, parseFloat(speedSlider.min));
                speedSlider.dispatchEvent(new Event('input')); // Dispara evento de input para atualizar
            } else { // Apenas Seta Baixo (diminuir pitch)
                pitchSlider.value = Math.max(parseInt(pitchSlider.value) - 1, parseInt(pitchSlider.min));
                pitchSlider.dispatchEvent(new Event('input')); // Dispara evento de input para atualizar
            }
            break;
        case 'KeyL': // Tecla 'L' para alternar loop
            toggleLoop();
            break;
        case 'KeyM': // Tecla 'M' para adicionar marcador
            addMarker();
            break;
        case 'KeyR': // Tecla 'R' para resetar todos os controles
            resetControls();
            break;
    }
});
