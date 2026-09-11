/**
 * Voice Call Feature
 * Uses browser Speech Recognition for listening + ElevenLabs for speaking
 */

class VoiceCall {
    constructor() {
        this.isCallActive = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.recognition = null;
        this.audioContext = null;
        this.currentAudio = null;

        // Silence detection - wait for user to finish speaking
        this.silenceTimer = null;
        this.silenceDelay = 4000; // Wait 4 seconds of silence before processing
        this.currentTranscript = ''; // Accumulate full transcript
        this.isProcessing = false; // Prevent duplicate processing

        // Session ID for conversation memory
        this.sessionId = 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.voiceHistory = [];

        // DOM Elements (will be set after modal is created)
        this.modal = null;
        this.statusText = null;
        this.transcriptText = null;
        this.responseText = null;
        this.callBtn = null;
        this.endCallBtn = null;
        this.waveAnimation = null;
        this.callTimerElement = null;

        // Call Timer
        this.callStartTime = null;
        this.callTimerInterval = null;

        this.initSpeechRecognition();
    }

    initSpeechRecognition() {
        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; // Keep listening continuously
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-IN'; // English (India) for real-time transcription
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.isListening = true;
            this.isProcessing = false;
            this.currentTranscript = '';
            this.updateStatus('Listening... (speak and pause when done)');
            this.showWaveAnimation(true);
        };

        this.recognition.onresult = (event) => {
            // Build complete transcript from all results
            let fullTranscript = '';
            let hasNewFinal = false;

            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
                if (event.results[i].isFinal && i >= event.resultIndex) {
                    hasNewFinal = true;
                }
            }

            // Update display with current transcript
            if (this.transcriptText) {
                this.transcriptText.textContent = fullTranscript;
            }

            // Store the current full transcript
            this.currentTranscript = fullTranscript;

            // Reset any existing silence timer
            if (this.silenceTimer) {
                clearTimeout(this.silenceTimer);
                this.silenceTimer = null;
            }

            // When we get any speech, update status
            if (fullTranscript.trim()) {
                this.updateStatus('Listening... (pause 4s to send)');
            }

            // Start silence timer on every result - triggers after 4 seconds of no new speech
            if (fullTranscript.trim() && !this.isProcessing) {
                this.silenceTimer = setTimeout(() => {
                    console.log('Silence detected, processing:', this.currentTranscript);
                    if (!this.isProcessing && this.currentTranscript.trim() && this.isCallActive) {
                        this.processSpeech();
                    }
                }, this.silenceDelay); // Use the class variable (4 seconds)
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech') {
                this.updateStatus('No speech detected. Click mic to try again.');
            } else {
                this.updateStatus('Error: ' + event.error);
            }
            this.isListening = false;
            this.showWaveAnimation(false);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.isCallActive && !this.isSpeaking && !this.isProcessing) {
                this.showWaveAnimation(false);
                // Auto-restart if call is still active and not processing
                setTimeout(() => {
                    if (this.isCallActive && !this.isSpeaking && !this.isProcessing) {
                        this.startListening();
                    }
                }, 300);
            }
        };
    }

    // Process the accumulated speech
    processSpeech() {
        if (this.isProcessing) return;

        this.isProcessing = true;
        const transcript = this.currentTranscript.trim();

        // Clear the timer
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }

        // Stop listening first
        this.stopListening();

        // Reset transcript for next round
        this.currentTranscript = '';

        // Process the speech
        if (transcript) {
            this.handleUserSpeech(transcript);
        } else {
            this.isProcessing = false;
            if (this.isCallActive) {
                this.startListening();
            }
        }
    }

    async handleUserSpeech(transcript) {
        if (!transcript.trim()) return;

        this.updateStatus('Processing...');
        this.showWaveAnimation(false);

        try {
            // Get selected model
            const selectedModel = this.modelSelect ? this.modelSelect.value : 'ling-3.0-flash-fin-free';
            console.log(`🤖 Using model: ${selectedModel}`);

            const response = await fetch('/api/voice/quick-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: transcript,
                    model: selectedModel,
                    sessionId: this.sessionId,
                    history: this.voiceHistory.slice(-20)
                })
            });

            const data = await response.json();

            if (data.success && data.response) {
                this.voiceHistory.push({ role: 'user', content: transcript }, { role: 'assistant', content: data.response });
                if (this.voiceHistory.length > 40) {
                    this.voiceHistory = this.voiceHistory.slice(-40);
                }
                // Speak the response
                await this.speakResponse(data.response);
            } else {
                this.updateStatus('Error getting response');
                // Resume listening after error
                if (this.isCallActive) {
                    setTimeout(() => this.startListening(), 1000);
                }
            }
        } catch (error) {
            console.error('Error getting AI response:', error);
            this.updateStatus('Error getting response');
            // Resume listening after error
            if (this.isCallActive) {
                setTimeout(() => this.startListening(), 1000);
            }
        }
    }

    async speakResponse(text) {
        this.isSpeaking = true;
        this.updateStatus('Speaking...');
        this.showWaveAnimation(true, 'speaking');

        try {
            // Clean text for speech (remove markdown, limits, LINKS, and think tags)
            let cleanText = text
                .replace(/<think>[\s\S]*?<\/think>/gi, '')  // Remove <think>...</think> blocks
                .replace(/<[^>]+>/g, '')  // Remove any HTML/XML tags
                .replace(/https?:\/\/[^\s]+/g, '')   // Remove http/https links completely
                .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
                .replace(/\*([^*]+)\*/g, '$1')       // Remove italic
                .replace(/#{1,6}\s/g, '')            // Remove headers
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove markdown links but keep text
                .replace(/```[\s\S]*?```/g, '')      // Remove code blocks
                .replace(/`([^`]+)`/g, '$1')         // Remove inline code
                .replace(/\n{3,}/g, '\n')            // Reduce multiple newlines
                .trim()
                .substring(0, 1000);  // Limit to 1000 chars

            console.log('🔊 Sending to TTS:', cleanText.substring(0, 100) + '...');

            const response = await fetch('/api/voice/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: cleanText,
                    voiceId: this.currentVoiceId
                })
            });

            if (!response.ok) {
                throw new Error('TTS API error');
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            this.currentAudio = new Audio(audioUrl);

            this.currentAudio.onended = () => {
                this.isSpeaking = false;
                this.showWaveAnimation(false);

                // Auto-listen again after speaking
                if (this.isCallActive) {
                    setTimeout(() => {
                        if (this.isCallActive) {
                            this.startListening();
                        }
                    }, 500);
                }

                URL.revokeObjectURL(audioUrl);
            };

            this.currentAudio.onerror = () => {
                this.isSpeaking = false;
                this.showWaveAnimation(false);
                this.updateStatus('Audio playback error');
            };

            await this.currentAudio.play();

        } catch (error) {
            console.error('TTS Error:', error);
            this.isSpeaking = false;
            this.showWaveAnimation(false);
            // Show the reply as text and keep the conversation going
            if (this.transcriptText) {
                this.transcriptText.textContent = text;
            }
            this.updateStatus('Speech synthesis unavailable');
            if (this.isCallActive) {
                setTimeout(() => this.startListening(), 1500);
            }
        }
    }

    startListening() {
        if (!this.recognition) {
            this.updateStatus('Speech recognition not supported');
            return;
        }

        if (this.isSpeaking) {
            return;  // Don't listen while speaking
        }

        try {
            this.recognition.start();
        } catch (e) {
            // Already started
        }
    }

    stopListening() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Ignore if already stopped
            }
        }
        this.isListening = false;
    }

    startCall() {
        this.isCallActive = true;
        this.modal.classList.add('active');
        this.updateStatus('Connecting...');

        // Start the call timer
        this.startCallTimer();

        // Riya introduces herself first when call starts
        const greetingMessages = [
            'Hi! My name is Riya. I am here to help you with anything at The Grand Palm. [chuckles] What would you like to know?',
            'Hello! I am Riya, your hotel assistant. [laughs] Ask me anything and I will help you out!',
            'Hi there! My name is Riya. Want to know something about the hotel? Go ahead, ask me anything!'
        ];
        const greeting = greetingMessages[Math.floor(Math.random() * greetingMessages.length)];

        // Speak the greeting first, then start listening
        this.speakResponse(greeting).then(() => {
            // After greeting, start listening
            if (this.isCallActive) {
                this.startListening();
            }
        });
    }

    // Call Timer Functions
    startCallTimer() {
        this.callStartTime = Date.now();
        if (this.callTimerElement) {
            this.callTimerElement.style.display = 'block';
            this.callTimerElement.textContent = '00:00';
        }
        this.callTimerInterval = setInterval(() => {
            this.updateCallTimer();
        }, 1000);
    }

    updateCallTimer() {
        if (!this.callStartTime || !this.callTimerElement) return;
        const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        this.callTimerElement.textContent = `${minutes}:${seconds}`;
    }

    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        this.callStartTime = null;
        if (this.callTimerElement) {
            this.callTimerElement.style.display = 'none';
        }
    }

    endCall() {
        this.isCallActive = false;
        this.isListening = false;
        this.isSpeaking = false;

        // Stop the call timer
        this.stopCallTimer();

        this.stopListening();

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        this.modal.classList.remove('active');
        this.showWaveAnimation(false);

        // Reset text
        if (this.transcriptText) this.transcriptText.textContent = '';

        // Reset conversation memory for this call
        this.voiceHistory = [];
    }

    updateStatus(text) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
    }

    showWaveAnimation(show, type = 'listening') {
        if (this.waveAnimation) {
            if (show) {
                this.waveAnimation.classList.add('active');
                this.waveAnimation.classList.toggle('speaking', type === 'speaking');
            } else {
                this.waveAnimation.classList.remove('active', 'speaking');
            }
        }
    }

    // Create and inject the voice modal HTML
    createModal() {
        const modalHTML = `
            <div class="voice-call-modal" id="voiceCallModal">
                <div class="voice-call-container">
                    <div class="voice-call-header">
                        <div class="call-avatar">
                            <svg viewBox="0 0 32 32" class="avatar-logo" style="width:32px;height:32px"><circle cx="16" cy="16" r="15" fill="#10b981"/><text x="16" y="22" font-size="18" font-weight="bold" text-anchor="middle" fill="white">GP</text></svg>
                        </div>
                        <h2>Riya</h2>
                        <p class="call-status" id="callStatus">Ready to talk</p>
                        <p class="call-timer" id="callTimer" style="display: none;">00:00</p>
                        
                        <!-- Model Selector -->
                        <div class="voice-model-selector">
                            <label for="voiceModelSelect">MODEL</label>
                            <select id="voiceModelSelect" class="voice-model-dropdown">
                                <option value="ling-3.0-flash-fin-free" selected>Ling 3.0 Flash</option>
                                <option value="mimo-v2.5-free">MiMo V2.5</option>
                                <option value="big-pickle">Big Pickle</option>
                                <option value="muse-spark-1.2-contributor-free">Muse Spark 1.2</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="voice-wave-animation" id="waveAnimation">
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                    </div>
                    
                    <div class="voice-transcript">
                        <div class="transcript-section">
                            <span class="transcript-label">You said:</span>
                            <p class="transcript-text" id="transcriptText"></p>
                        </div>
                    </div>
                    
                    <!-- Text Input Section -->
                    <div class="voice-text-input">
                        <input type="text" id="voiceTextInput" placeholder="Or type your question here..." />
                        <button class="voice-send-btn" id="voiceSendBtn" title="Send">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="voice-call-actions">
                        <button class="voice-mic-btn" id="voiceMicBtn" title="Tap to speak">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                                <line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                        </button>
                        <button class="voice-end-btn" id="voiceEndBtn" title="End call">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4444" stroke-width="3"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Cache DOM elements
        this.modal = document.getElementById('voiceCallModal');
        this.statusText = document.getElementById('callStatus');
        this.transcriptText = document.getElementById('transcriptText');
        this.waveAnimation = document.getElementById('waveAnimation');
        this.textInput = document.getElementById('voiceTextInput');
        this.modelSelect = document.getElementById('voiceModelSelect');

        const micBtn = document.getElementById('voiceMicBtn');
        const endBtn = document.getElementById('voiceEndBtn');
        const sendBtn = document.getElementById('voiceSendBtn');

        // Mic button: if listening with text, send it; otherwise start listening
        micBtn.addEventListener('click', () => {
            if (this.isListening && this.currentTranscript.trim()) {
                // User clicked mic while speaking with content - send immediately
                this.processSpeech();
            } else if (!this.isListening && !this.isProcessing && !this.isSpeaking) {
                // Start listening
                this.startListening();
            }
        });
        endBtn.addEventListener('click', () => this.endCall());

        // Language Toggle Logic - Default to English
        this.currentVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Default English Voice
        this.currentLang = 'en-IN'; // Default English

        // Cache timer element
        this.callTimerElement = document.getElementById('callTimer');

        // Model selector change event
        if (this.modelSelect) {
            this.modelSelect.addEventListener('change', () => {
                const modelName = this.modelSelect.options[this.modelSelect.selectedIndex].text;
                this.updateStatus(`Model: ${modelName}`);
                console.log(`🤖 Model changed to: ${this.modelSelect.value}`);
            });
        }

        // Handle text input send
        sendBtn.addEventListener('click', () => this.handleTextInput());
        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleTextInput();
            }
        });

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.endCall();
            }
        });
    }

    // Handle typed text input
    handleTextInput() {
        const text = this.textInput.value.trim();
        if (!text) return;

        // Show the typed text
        if (this.transcriptText) {
            this.transcriptText.textContent = text;
        }

        // Clear input
        this.textInput.value = '';

        // Process the question
        this.handleUserSpeech(text);
    }
}

// Initialize voice call when DOM is ready
let voiceCall;

document.addEventListener('DOMContentLoaded', () => {
    voiceCall = new VoiceCall();
    voiceCall.createModal();

    // Add call button click handler
    const callBtn = document.getElementById('voiceCallBtn');
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            voiceCall.startCall();
        });
    }
});
