/**
 * F012-F016: Voice Therapy Service
 * 
 * Using Web Speech API with optimized voice selection for soothing experience.
 * Modern browsers (Chrome, Edge) have high-quality neural voices built-in.
 * 
 * Features:
 * - Instant loading (no WASM download)
 * - High-quality voices on modern browsers
 * - Soft, calm voice selection algorithm
 * - Works offline after initial load
 * 
 * @module services/voice-service
 */

// =============================================================================
// TYPES
// =============================================================================

export type PiperVoice = string;

export interface VoiceConfig {
  voice: PiperVoice;
  speed: number;       // 0.5 - 2.0
  pitch: number;       // 0.5 - 2.0
  volume: number;      // 0.0 - 1.0
}

export interface TTSOptions {
  text: string;
  voice?: PiperVoice;
  speed?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export type VoiceServiceStatus = 
  | 'idle'
  | 'loading'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'error';

export interface VoiceServiceState {
  status: VoiceServiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  sttSupported: boolean;
  ttsLoaded: boolean;
  ttsLoadProgress: number;
  error: string | null;
  currentTranscript: string;
}

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  voice: SpeechSynthesisVoice | null;
}

// =============================================================================
// VOICE SERVICE CLASS
// =============================================================================

class VoiceService {
  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private availableVoicesList: VoiceOption[] = [];
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  
  private state: VoiceServiceState = {
    status: 'idle',
    isListening: false,
    isSpeaking: false,
    sttSupported: false,
    ttsLoaded: false,
    ttsLoadProgress: 0,
    error: null,
    currentTranscript: '',
  };

  private config: VoiceConfig = {
    voice: 'default',
    speed: 0.9,        // Slightly slower for calm feel
    pitch: 0.95,       // Slightly lower pitch for soothing
    volume: 0.85,
  };

  private listeners: Set<(state: VoiceServiceState) => void> = new Set();

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  constructor() {
    this.checkSTTSupport();
    this.initializeTTS();
  }

  private checkSTTSupport(): void {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    this.state.sttSupported = !!SpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.updateState({ isListening: true, status: 'listening', error: null });
    };

    this.recognition.onend = () => {
      this.updateState({ isListening: false, status: this.state.ttsLoaded ? 'ready' : 'idle' });
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.updateState({ 
          isListening: false, 
          status: 'error',
          error: `Mic error: ${event.error}`,
        });
      }
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      this.updateState({
        currentTranscript: finalTranscript || interimTranscript,
      });
    };
  }

  /**
   * Initialize Web Speech API TTS with best available voice
   */
  async initializeTTS(): Promise<boolean> {
    if (this.state.ttsLoaded) return true;

    try {
      this.updateState({ status: 'loading', ttsLoadProgress: 30 });

      if (!('speechSynthesis' in window)) {
        throw new Error('Speech synthesis not supported');
      }

      // Wait for voices to load
      await this.loadVoices();
      
      this.updateState({ ttsLoaded: true, status: 'ready', ttsLoadProgress: 100 });
      console.log('✅ TTS initialized with voice:', this.selectedVoice?.name || 'default');
      return true;
    } catch (error) {
      console.error('Failed to initialize TTS:', error);
      this.updateState({ 
        status: 'error', 
        ttsLoaded: false,
        error: 'Voice loading failed.',
      });
      return false;
    }
  }

  private async loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const attemptLoad = () => {
        const voices = speechSynthesis.getVoices();
        
        if (voices.length > 0) {
          this.processVoices(voices);
          this.updateState({ ttsLoadProgress: 70 });
          resolve();
        } else {
          // Wait for voices to load
          speechSynthesis.onvoiceschanged = () => {
            const loadedVoices = speechSynthesis.getVoices();
            this.processVoices(loadedVoices);
            this.updateState({ ttsLoadProgress: 70 });
            resolve();
          };
          
          // Fallback timeout
          setTimeout(() => {
            const fallbackVoices = speechSynthesis.getVoices();
            if (fallbackVoices.length > 0) {
              this.processVoices(fallbackVoices);
            }
            resolve();
          }, 1000);
        }
      };

      attemptLoad();
    });
  }

  private processVoices(voices: SpeechSynthesisVoice[]): void {
    // Priority list of soft, high-quality voices (neural/premium voices)
    const preferredVoices = [
      // Microsoft Edge neural voices (best quality)
      'Microsoft Aria Online',
      'Microsoft Jenny',
      'Microsoft Aria',
      'Microsoft Zira',
      'Microsoft AvaMultilingual Online',
      // Google voices
      'Google UK English Female',
      'Google US English',
      // Apple voices
      'Samantha',
      'Karen',
      'Moira',
      'Fiona',
      // Generic female voices (usually softer)
      'female',
      'woman',
    ];

    // Find the best voice
    let bestVoice: SpeechSynthesisVoice | null = null;
    
    for (const preferred of preferredVoices) {
      const found = voices.find(v => 
        v.name.toLowerCase().includes(preferred.toLowerCase()) &&
        v.lang.startsWith('en')
      );
      if (found) {
        bestVoice = found;
        break;
      }
    }

    // Fallback to any English voice
    if (!bestVoice) {
      bestVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
    }

    this.selectedVoice = bestVoice;

    // Build available voices list for UI
    this.availableVoicesList = voices
      .filter(v => v.lang.startsWith('en'))
      .slice(0, 10)
      .map(v => ({
        id: v.name,
        name: v.name.replace(/Microsoft |Google |Apple /g, '').split(' ')[0],
        description: v.name,
        voice: v,
      }));

    // Add "default" option
    if (this.selectedVoice) {
      this.availableVoicesList.unshift({
        id: 'default',
        name: 'Auto (Best)',
        description: `Auto-selected: ${this.selectedVoice.name}`,
        voice: this.selectedVoice,
      });
    }

    console.log('🎤 Available voices:', this.availableVoicesList.map(v => v.name));
    console.log('🎤 Selected voice:', this.selectedVoice?.name);
  }

  // ===========================================================================
  // SPEECH-TO-TEXT (STT)
  // ===========================================================================

  startListening(): boolean {
    if (!this.recognition || !this.state.sttSupported) {
      this.updateState({ error: 'Speech recognition not supported' });
      return false;
    }

    if (this.state.isListening) return true;
    if (this.state.isSpeaking) {
      this.stopSpeaking();
    }

    try {
      this.updateState({ currentTranscript: '' });
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('Failed to start listening:', error);
      return false;
    }
  }

  stopListening(): string {
    if (!this.recognition || !this.state.isListening) {
      return this.state.currentTranscript;
    }

    try {
      this.recognition.stop();
    } catch (e) {
      // Ignore
    }
    
    return this.state.currentTranscript;
  }

  getCurrentTranscript(): string {
    return this.state.currentTranscript;
  }

  // ===========================================================================
  // TEXT-TO-SPEECH (TTS)
  // ===========================================================================

  async speak(options: TTSOptions): Promise<void> {
    const { 
      text, 
      voice,
      speed = this.config.speed,
      pitch = this.config.pitch,
      onStart, 
      onEnd, 
      onError 
    } = options;

    if (!text.trim()) return;

    // Stop any current speech or listening
    this.stopSpeaking();
    this.stopListening();

    try {
      if (!this.state.ttsLoaded) {
        await this.initializeTTS();
      }

      this.updateState({ isSpeaking: true, status: 'speaking' });
      onStart?.();

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set voice
      if (voice && voice !== 'default') {
        const selectedVoiceObj = this.availableVoicesList.find(v => v.id === voice);
        if (selectedVoiceObj?.voice) {
          utterance.voice = selectedVoiceObj.voice;
        }
      } else if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      // Set parameters for soothing effect
      utterance.rate = speed;          // Slower
      utterance.pitch = pitch;         // Slightly lower
      utterance.volume = this.config.volume;

      // Setup audio visualization
      this.startVisualization();

      // Handle events
      utterance.onend = () => {
        this.stopVisualization();
        this.updateState({ isSpeaking: false, status: 'ready' });
        onEnd?.();
      };

      utterance.onerror = (event) => {
        this.stopVisualization();
        this.updateState({ isSpeaking: false, status: 'error' });
        onError?.(new Error(event.error));
      };

      // Speak
      speechSynthesis.speak(utterance);

    } catch (error) {
      console.error('TTS error:', error);
      this.updateState({ isSpeaking: false, status: 'error' });
      onError?.(error as Error);
    }
  }

  stopSpeaking(): void {
    speechSynthesis.cancel();
    this.stopVisualization();
    
    if (this.state.isSpeaking) {
      this.updateState({ isSpeaking: false, status: this.state.ttsLoaded ? 'ready' : 'idle' });
    }
  }

  // ===========================================================================
  // AUDIO VISUALIZATION (Simulated for Web Speech API)
  // ===========================================================================

  private startVisualization(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create analyser for visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Create oscillator to simulate audio activity
      // (Web Speech API doesn't give us direct audio access)
      this.oscillator = this.audioContext.createOscillator();
      this.gainNode = this.audioContext.createGain();
      
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(0, this.audioContext.currentTime);
      this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      
      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      // Don't connect to destination - we don't want to hear the oscillator
      
      this.oscillator.start();

    } catch (error) {
      console.warn('Visualization setup failed:', error);
    }
  }

  private stopVisualization(): void {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
      } catch (e) {
        // Ignore
      }
      this.oscillator = null;
    }
    this.gainNode = null;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  getWaveformData(): Uint8Array | null {
    // Return simulated waveform data when speaking
    if (!this.state.isSpeaking) return null;
    
    const dataArray = new Uint8Array(128);
    const time = Date.now() / 1000;
    
    for (let i = 0; i < dataArray.length; i++) {
      // Create a smooth, organic wave pattern
      const wave1 = Math.sin(time * 3 + i * 0.1) * 30;
      const wave2 = Math.sin(time * 5 + i * 0.15) * 20;
      const wave3 = Math.sin(time * 7 + i * 0.05) * 10;
      dataArray[i] = 128 + wave1 + wave2 + wave3;
    }
    
    return dataArray;
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  setConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.voice) {
      const voiceOption = this.availableVoicesList.find(v => v.id === config.voice);
      if (voiceOption?.voice) {
        this.selectedVoice = voiceOption.voice;
      }
    }
  }

  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  getAvailableVoices(): { id: PiperVoice; name: string; description: string }[] {
    return this.availableVoicesList.map(v => ({
      id: v.id,
      name: v.name,
      description: v.description,
    }));
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  subscribe(listener: (state: VoiceServiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): VoiceServiceState {
    return { ...this.state };
  }

  private updateState(partial: Partial<VoiceServiceState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  dispose(): void {
    this.stopListening();
    this.stopSpeaking();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.listeners.clear();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const voiceService = new VoiceService();
export default voiceService;
