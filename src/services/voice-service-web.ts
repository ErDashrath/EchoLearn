/**
 * F012-F016: Voice Therapy Service (Web Speech API)
 *
 * TTS:
 * - Native browser SpeechSynthesis (Web Speech API)
 *
 * STT:
 * - Browser SpeechRecognition / webkitSpeechRecognition
 *
 * @module services/voice-service-web
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

const INTERRUPTED_ERROR = 'Speech interrupted';

// =============================================================================
// VOICE SERVICE CLASS
// =============================================================================

class VoiceService {
  private recognition: any = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private availableVoicesList: VoiceOption[] = [
    {
      id: 'default',
      name: 'Auto (Best)',
      description: 'Auto-select best available native voice',
      voice: null,
    },
  ];

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
    speed: 0.95,
    pitch: 0.9,
    volume: 0.9,
  };

  private listeners: Set<(state: VoiceServiceState) => void> = new Set();
  private speakGeneration = 0;
  private preloadPromise: Promise<boolean> | null = null;
  private nativeVoicesLoaded = false;

  constructor() {
    this.checkSTTSupport();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

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
      this.updateState({
        isListening: false,
        status: this.state.ttsLoaded ? 'ready' : 'idle',
      });
    };

    this.recognition.onerror = (event: any) => {
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
        currentTranscript: (finalTranscript || interimTranscript).trim(),
      });
    };
  }

  async initializeTTS(): Promise<boolean> {
    if (this.state.ttsLoaded) return true;

    try {
      this.updateState({ status: 'loading', ttsLoadProgress: 20, error: null });
      await this.loadNativeVoices();
      this.updateState({ status: 'ready', ttsLoaded: true, ttsLoadProgress: 100 });
      return true;
    } catch (error) {
      this.updateState({
        status: 'error',
        ttsLoaded: false,
        error: 'Voice loading failed.',
      });
      return false;
    }
  }

  async preloadForSession(): Promise<boolean> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.preloadPromise = this.initializeTTS();
    try {
      return await this.preloadPromise;
    } finally {
      this.preloadPromise = null;
    }
  }

  private async loadNativeVoices(): Promise<void> {
    if (this.nativeVoicesLoaded) return;
    if (!('speechSynthesis' in window)) {
      throw new Error('Speech synthesis not supported');
    }

    await new Promise<void>((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.processNativeVoices(voices);
        this.updateState({ ttsLoadProgress: 80 });
        resolve();
        return;
      }

      speechSynthesis.onvoiceschanged = () => {
        const loadedVoices = speechSynthesis.getVoices();
        this.processNativeVoices(loadedVoices);
        this.updateState({ ttsLoadProgress: 80 });
        resolve();
      };

      setTimeout(() => {
        const fallbackVoices = speechSynthesis.getVoices();
        if (fallbackVoices.length > 0) {
          this.processNativeVoices(fallbackVoices);
          this.updateState({ ttsLoadProgress: 80 });
        }
        resolve();
      }, 1200);
    });

    this.nativeVoicesLoaded = true;
  }

  private processNativeVoices(voices: SpeechSynthesisVoice[]): void {
    const best = voices.find(v => v.lang.startsWith('en') && /aria|jenny|samantha|zira|google/i.test(v.name))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0]
      || null;

    this.selectedVoice = best;

    const nativeOptions: VoiceOption[] = voices
      .filter(v => v.lang.startsWith('en'))
      .slice(0, 10)
      .map(v => ({
        id: `native:${v.name}`,
        name: v.name.replace(/Microsoft |Google |Apple /g, '').split(' ')[0],
        description: `Browser voice: ${v.name}`,
        voice: v,
      }));

    this.availableVoicesList = [
      {
        id: 'default',
        name: 'Auto (Best)',
        description: `Auto-selected: ${this.selectedVoice?.name || 'English voice'}`,
        voice: this.selectedVoice,
      },
      ...nativeOptions,
    ];
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
    if (this.state.isSpeaking) this.stopSpeaking();

    try {
      this.updateState({ currentTranscript: '' });
      this.recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  stopListening(): string {
    if (!this.recognition || !this.state.isListening) {
      return this.state.currentTranscript;
    }

    try {
      this.recognition.stop();
    } catch {
      // ignore
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
      onError,
    } = options;

    const cleanText = text.trim();
    if (!cleanText) return;

    this.stopSpeaking();
    const generationAtStart = this.speakGeneration;
    this.stopListening();

    if (!this.state.ttsLoaded) {
      const ok = await this.initializeTTS();
      if (!ok) {
        onError?.(new Error('TTS initialization failed'));
        return;
      }
    }

    this.updateState({ isSpeaking: true, status: 'speaking', error: null });
    onStart?.();

    try {
      const chunks = this.splitTextForSpeech(cleanText.slice(0, 680));
      for (const chunk of chunks) {
        if (generationAtStart !== this.speakGeneration) {
          throw new Error(INTERRUPTED_ERROR);
        }

        await this.speakChunkNative(chunk, voice, speed, pitch);
      }

      if (generationAtStart !== this.speakGeneration) {
        return;
      }

      this.updateState({ isSpeaking: false, status: 'ready' });
      onEnd?.();
    } catch (error) {
      if (error instanceof Error && error.message === INTERRUPTED_ERROR) {
        return;
      }
      this.updateState({ isSpeaking: false, status: 'error' });
      onError?.(error as Error);
    }
  }

  private async speakChunkNative(
    chunk: string,
    voice: PiperVoice | undefined,
    speed: number,
    pitch: number
  ): Promise<void> {
    const utterance = new SpeechSynthesisUtterance(chunk);

    const nativeVoiceId = voice?.startsWith('native:') ? voice : null;
    if (nativeVoiceId) {
      const selected = this.availableVoicesList.find(v => v.id === nativeVoiceId);
      if (selected?.voice) {
        utterance.voice = selected.voice;
      }
    } else if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    utterance.rate = Math.min(1.08, Math.max(0.85, speed));
    utterance.pitch = Math.min(1.05, Math.max(0.82, pitch));
    utterance.volume = this.config.volume;

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(event.error));
      speechSynthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.speakGeneration += 1;
    speechSynthesis.cancel();

    if (this.state.isSpeaking) {
      this.updateState({
        isSpeaking: false,
        status: this.state.ttsLoaded ? 'ready' : 'idle',
      });
    }
  }

  private splitTextForSpeech(text: string, targetChunkSize = 180): string[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    if (cleaned.length <= targetChunkSize) return [cleaned];

    const sentences = cleaned.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [cleaned];
    const chunks: string[] = [];
    let current = '';

    const pushChunk = (chunk: string) => {
      const value = chunk.trim();
      if (value) chunks.push(value);
    };

    for (const sentence of sentences) {
      if (!current) {
        current = sentence;
        continue;
      }

      if (`${current} ${sentence}`.length <= targetChunkSize) {
        current = `${current} ${sentence}`;
      } else {
        pushChunk(current);
        current = sentence;
      }
    }

    pushChunk(current);
    return chunks;
  }

  // ===========================================================================
  // VISUALIZATION DATA (best-effort synthetic for UI)
  // ===========================================================================

  getFrequencyData(): Uint8Array | null {
    if (!this.state.isSpeaking && !this.state.isListening) return null;

    const data = new Uint8Array(128);
    const time = Date.now() / 1000;
    for (let i = 0; i < data.length; i++) {
      data[i] = 128 + Math.sin(time * 4 + i * 0.12) * 40;
    }
    return data;
  }

  getWaveformData(): Uint8Array | null {
    return this.getFrequencyData();
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  setConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
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
    this.listeners.clear();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const voiceService = new VoiceService();
export default voiceService;

