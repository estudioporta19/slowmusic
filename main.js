        // JavaScript
        let currentAudioBuffer = null; 
        let sourceNode = null; 
        let audioContext = null; 
        let currentCell = null; 
        
        let loopPoints = { start: null, end: null };
        let isLooping = false;
        
        const audioPlayerHtml = document.getElementById('audioPlayer'); 

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
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); // <--- Decodificar aqui para acesso

                // --- NOVA VERIFICAÇÃO DE SANIDADE AQUI ---
                if (!audioBuffer || 
                    isNaN(audioBuffer.length) || 
                    isNaN(audioBuffer.numberOfChannels) || 
                    isNaN(audioBuffer.sampleRate) ||
                    audioBuffer.length <= 0 ||
                    audioBuffer.numberOfChannels <= 0 ||
                    audioBuffer.sampleRate <= 0
                ) {
                    throw new Error("AudioBuffer is invalid or incomplete (non-finite values).");
                }
                // --- FIM DA NOVA VERIFICAÇÃO ---
                
                // Agora que temos o audioBuffer, precisamos de passar o ArrayBuffer original
                // porque a biblioteca DetectBPM espera o ArrayBuffer para decodificar internamente
                // ou precisamos de ter a certeza de que a biblioteca pode usar o AudioBuffer diretamente.

                // Revendo a biblioteca `bpm-detective.min.js`:
                // A função `detect(buffer)` espera um `buffer` que é o `ArrayBuffer` do ficheiro.
                // Dentro dela, ela cria um `OfflineContext` com `buffer.length`, etc.
                // Então, a sua linha `const bpm = await DetectBPM(arrayBuffer);` está correta.
                // O erro ocorre dentro da função `getLowPassSource(buffer)` que é chamada por `detect(buffer)`.
                // Isso significa que o problema é com a *interpretação* do `arrayBuffer` pelo `getLowPassSource` que acaba por ter valores não finitos.

                // A VERDADEIRA CAUSA: a `detect` function na biblioteca `bpm-detective`
                // espera um *AudioBuffer*, não um *ArrayBuffer*!

                // Olhando novamente para a função detect na biblioteca:
                // function detect(buffer){ var source=getLowPassSource(buffer); source.start(0); return[findPeaks,identifyIntervals,groupByTempo(buffer.sampleRate),getTopCandidate].reduce(function(state,fn){return fn(state)},source.buffer.getChannelData(0))}
                // Ela usa `buffer.sampleRate` e `source.buffer.getChannelData(0)`.
                // Isso só funciona se `buffer` já for um AudioBuffer, e não um ArrayBuffer.

                // ENTÃO, A CORREÇÃO É MAIS SIMPLES:

                // A `DetectBPM` deve receber o `AudioBuffer` que você já decodificou!
                const bpm = await DetectBPM(audioBuffer); // <--- A GRANDE CORREÇÃO AQUI!
                
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
            stopCurrentAudio(); 
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

        function stopCurrentAudio() {
            if (sourceNode) {
                sourceNode.stop();
                sourceNode.disconnect();
                sourceNode = null;
            }
            audioPlayerHtml.pause();
            audioPlayerHtml.currentTime = 0;
            currentAudioBuffer = null;
            // Não resetar currentCell aqui, para permitir re-play do mesmo item
            
            progressFill.style.width = '0%';
            document.getElementById('currentTime').textContent = '0:00';
            document.getElementById('totalTime').textContent = '0:00';
            pauseProgressUpdate(); 
            stopBPMUpdate(); 
            currentBPMDisplay.textContent = '--'; 

            // Desativar a célula visualmente se houver uma ativa
            document.querySelectorAll('.cell.active').forEach(cell => cell.classList.remove('active'));
        }

        function playAudio(cellNumber, startTime = 0) {
            initAudioContext(); 
            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    // Tentar reproduzir novamente depois de retomar o contexto
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
                stopCurrentAudio(); // Para a reprodução e limpa o UI
                return;
            }
            const audioBuffer = cellData.audioBuffer;

            // Se o áudio já estiver a tocar e for o mesmo ficheiro, alternar play/pause
            if (currentCell === cellNumber && sourceNode && audioContext.state === 'running') {
                pausePlayback(); 
                return;
            }
            
            // Só parar completamente o áudio se for uma nova célula
            if (currentCell !== cellNumber) {
                stopCurrentAudio(); 
                clearLoop(); 
                resetPitch(); 
            }
            
            currentAudioBuffer = audioBuffer;
            currentCell = cellNumber;

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
            
            sourceNode.start(0, startTime); 
            sourceNode.lastOffset = startTime; 

            document.getElementById('totalTime').textContent = formatTime(currentAudioBuffer.duration);
            
            document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active')); 
            document.querySelector(`.cell[data-cell-number="${cellNumber}"]`).classList.add('active'); 
            
            startProgressUpdate(startTime);
            startBPMUpdateInterval(); 
        }

        function pausePlayback() {
            if (sourceNode && audioContext.state === 'running') {
                pauseProgressUpdate(); 
                audioContext.suspend(); 
                stopBPMUpdate(); 
            }
        }

        function resumePlayback() {
            if (currentCell && cellAudioData[currentCell] && audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    playAudio(currentCell, sourceNode ? sourceNode.lastOffset : 0); 
                }).catch(e => console.error("Erro ao retomar AudioContext para resumePlayback:", e));
            } else if (currentCell && cellAudioData[currentCell] && !sourceNode) {
                 // Caso o áudio tenha terminado mas a célula ainda esteja selecionada
                 playAudio(currentCell, 0);
            }
        }

        let progressInterval = null;
        let audioStartTimeContext = 0; 
        let audioOffsetPlayback = 0; 

        function startProgressUpdate(initialOffset = 0) {
            if (progressInterval) clearInterval(progressInterval);

            if (audioContext.state === 'suspended') {
                 // Tenta retomar se estiver suspenso para que o tempo do contexto avance
                 audioContext.resume();
            }

            audioStartTimeContext = audioContext.currentTime;
            audioOffsetPlayback = initialOffset; 
            
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
                            // Parar o nó atual e iniciar um novo do ponto de loop
                            sourceNode.stop(); 
                            sourceNode.disconnect();
                            sourceNode = null; // Resetar para que playAudio crie um novo
                            playAudio(currentCell, loopPoints.start); 
                        }
                    } else if (currentTheoreticalTime >= currentAudioBuffer.duration) {
                        // Se não há loop e o áudio termina naturalmente
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
            if (sourceNode) {
                const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                sourceNode.lastOffset = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                sourceNode.stop();
                sourceNode.disconnect();
                sourceNode = null;
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
                // Não é necessário recalcular o effectiveBPM aqui, pois o evento 'input' do slider já o faz
                // E queremos que ele "pisque" com o valor atual a cada 4 tempos
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
            if (sourceNode) {
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
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BUTTON')) {
                if (e.key.toLowerCase() === ' ') {
                    document.activeElement.blur(); 
                } else {
                    return; 
                }
            }

            switch(e.key.toLowerCase()) {
                case 'a':
                    if (sourceNode && currentAudioBuffer) {
                        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                        const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                        setLoopPoint('start', currentTheoreticalTime);
                    }
                    break;
                case 'b':
                    if (sourceNode && currentAudioBuffer) {
                        const elapsedTime = audioContext.currentTime - audioStartTimeContext;
                        const currentTheoreticalTime = audioOffsetPlayback + (elapsedTime * sourceNode.playbackRate.value);
                        setLoopPoint('end', currentTheoreticalTime);
                    }
                    break;
                case 'x':
                    clearLoop();
                    break;
                case ' ': 
                    e.preventDefault(); 
                    if (currentCell && cellAudioData[currentCell]) {
                        if (sourceNode && audioContext.state === 'running') {
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
            
            if (point === 'start') {
                document.getElementById('pointA').textContent = formatTime(time);
            } else {
                document.getElementById('pointB').textContent = formatTime(time);
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
                loopMarkers.style.backgroundColor = 'transparent';
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
            if (currentCell) {
                document.querySelector(`.cell[data-cell-number="${currentCell}"]`).classList.remove('active');
            }
            stopCurrentAudio(); 
            clearLoop();
            resetPitch();
            currentBPMDisplay.textContent = '--'; 
        }

        progressBar.addEventListener('click', function(e) {
            if (!currentAudioBuffer || isNaN(currentAudioBuffer.duration)) return;
            
            const rect = progressBar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            const newTime = percentage * currentAudioBuffer.duration;
            
            if (currentCell !== null) {
                stopCurrentAudio(); 
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
                playAudio(cellNumber);
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

