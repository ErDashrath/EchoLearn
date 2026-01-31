/**
 * F012-F016: Voice Therapy Service
 * 
 * Uses:
 * - STT: Whisper via @huggingface/transformers (WebGPU/WASM accelerated)
 * - TTS: Piper WASM (offline, high-quality soothing voice)
 * 
 * Based on MindScribe V0.1 implementation with proper espeak-ng phonemizer
 * 
 * @module services/voice-service
 */

import { pipeline, env } from '@huggingface/transformers';
import { piperGenerate, HF_BASE } from 'piper-wasm';

// Configure transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// =============================================================================
// TYPES
// =============================================================================

export interface PiperVoice {
  id: string;
  name: string;
  language: string;
  gender: 'female' | 'male';
  size: string;
  quality: string;
  category: 'asmr' | 'natural';
  icon: string;
  description: string;
  modelPath: string;
  recommended: boolean;
}

export interface VoiceConfig {
  voice: PiperVoice;
  speed: number;
  volume: number;
}

export interface TTSOptions {
  text: string;
  voice?: PiperVoice;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export type VoiceServiceStatus = 
  | 'idle'
  | 'loading-stt'
  | 'loading-tts'
  | 'ready'
  | 'listening'
  | 'transcribing'
  | 'speaking'
  | 'error';

export interface VoiceServiceState {
  status: VoiceServiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  sttLoaded: boolean;
  ttsLoaded: boolean;
  loadProgress: number;
  error: string | null;
  currentTranscript: string;
}

// =============================================================================
// AVAILABLE VOICES (Curated for ASMR/Therapeutic)
// =============================================================================

export const PIPER_VOICES: PiperVoice[] = [
  // === FEMALE VOICES (Therapeutic/ASMR) ===
  {
    id: 'en_US-amy-medium',
    name: 'Amy',
    language: 'en-US',
    gender: 'female',
    size: '30MB',
    quality: 'high',
    category: 'asmr',
    icon: '🌸',
    description: 'Soft, gentle whisper-like voice - Perfect for ASMR therapy',
    modelPath: 'en/en_US/amy/medium/en_US-amy-medium.onnx',
    recommended: true
  },
  {
    id: 'en_GB-jenny_dioco-medium',
    name: 'Jenny',
    language: 'en-GB',
    gender: 'female',
    size: '28MB',
    quality: 'high',
    category: 'asmr',
    icon: '🌺',
    description: 'Calm, soothing British voice - Relaxing and gentle',
    modelPath: 'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx',
    recommended: true
  },
  {
    id: 'en_US-lessac-medium',
    name: 'Lessac',
    language: 'en-US',
    gender: 'female',
    size: '30MB',
    quality: 'high',
    category: 'natural',
    icon: '💜',
    description: 'Natural, empathetic tone - Warm and conversational',
    modelPath: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    recommended: false
  },
  // === MALE VOICES (Therapeutic/ASMR) ===
  {
    id: 'en_US-joe-medium',
    name: 'Joe',
    language: 'en-US',
    gender: 'male',
    size: '28MB',
    quality: 'high',
    category: 'asmr',
    icon: '🌿',
    description: 'Deep, calming voice - Soothing baritone for relaxation',
    modelPath: 'en/en_US/joe/medium/en_US-joe-medium.onnx',
    recommended: true
  },
  {
    id: 'en_GB-alan-medium',
    name: 'Alan',
    language: 'en-GB',
    gender: 'male',
    size: '28MB',
    quality: 'high',
    category: 'asmr',
    icon: '🍃',
    description: 'Gentle British male - Soft-spoken and reassuring',
    modelPath: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx',
    recommended: true
  },
];

// =============================================================================
// VOICE SERVICE CLASS
// =============================================================================

class VoiceService {
  private whisperPipeline: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private mediaStream: MediaStream | null = null;
  
  // Piper base path for WASM assets
  private piperBasePath = '/piper';
  
  private state: VoiceServiceState = {
    status: 'idle',
    isListening: false,
    isSpeaking: false,
    isTranscribing: false,
    sttLoaded: false,
    ttsLoaded: false,
    loadProgress: 0,
    error: null,
    currentTranscript: '',
  };

  private config: VoiceConfig = {
    voice: PIPER_VOICES[0], // Amy - soft, warm
    speed: 1.0,
    volume: 0.85,
  };

  private listeners: Set<(state: VoiceServiceState) => void> = new Set();

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize Whisper STT model (WebGPU/WASM accelerated)
   */
  async initializeSTT(): Promise<boolean> {
    if (this.state.sttLoaded) return true;

    try {
      this.updateState({ status: 'loading-stt', loadProgress: 0 });
      console.log('🎤 Loading Whisper model...');

      // Force WASM for stability (WebGPU has ONNX issues)
      const device = 'wasm';
      console.log(`[Whisper] Using device: ${device.toUpperCase()}`);

      // Load Whisper tiny model for fast transcription
      this.whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        {
          device,
          dtype: 'q8', // Quantized int8 for stability
          progress_callback: (progress: any) => {
            if (progress.status === 'progress' && progress.progress !== undefined) {
              const percent = Math.round(progress.progress);
              this.updateState({ loadProgress: percent });
              console.log(`Loading Whisper: ${percent}%`);
            }
          },
        }
      );

      this.updateState({ sttLoaded: true, loadProgress: 100 });
      console.log('✅ Whisper STT initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize STT:', error);
      this.updateState({ 
        status: 'error', 
        error: 'Failed to load speech recognition model',
      });
      return false;
    }
  }

  /**
   * Initialize Piper TTS (warmup synthesis)
   */
  async initializeTTS(): Promise<boolean> {
    if (this.state.ttsLoaded) return true;

    try {
      this.updateState({ status: 'loading-tts' });
      console.log('🔊 Warming up Piper TTS...');

      // Warmup with a small test to preload WASM and model
      await this._synthesizeWithPiper('test', this.config.voice, true);

      this.updateState({ ttsLoaded: true });
      console.log('✅ Piper TTS ready with espeak-ng phonemizer');
      return true;
    } catch (error) {
      console.warn('⚠️ TTS warmup failed, will try on first speak:', error);
      // Don't fail - let first real synthesis attempt handle it
      this.updateState({ ttsLoaded: true });
      return true;
    }
  }

  /**
   * Initialize both STT and TTS
   */
  async initialize(): Promise<boolean> {
    const sttOk = await this.initializeSTT();
    const ttsOk = await this.initializeTTS();
    
    if (sttOk && ttsOk) {
      this.updateState({ status: 'ready' });
    }
    
    return sttOk && ttsOk;
  }

  // ===========================================================================
  // SPEECH-TO-TEXT (Whisper)
  // ===========================================================================

  /**
   * Start recording audio for transcription
   */
  async startListening(): Promise<boolean> {
    if (!this.state.sttLoaded) {
      await this.initializeSTT();
    }

    if (this.state.isListening) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.updateState({ isListening: true, status: 'listening', currentTranscript: '' });
      
      // Setup audio visualization
      this.setupAudioVisualization(this.mediaStream);
      
      console.log('🎤 Listening...');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.updateState({ error: 'Microphone access denied' });
      return false;
    }
  }

  /**
   * Stop recording and transcribe
   */
  async stopListening(): Promise<string> {
    if (!this.state.isListening || !this.mediaRecorder) {
      return this.state.currentTranscript;
    }

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        this.updateState({ isListening: false, status: 'transcribing', isTranscribing: true });
        
        // Stop media stream
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(track => track.stop());
          this.mediaStream = null;
        }

        // Create audio blob
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        if (audioBlob.size < 1000) {
          console.log('Audio too short, skipping transcription');
          this.updateState({ isTranscribing: false, status: 'ready' });
          resolve('');
          return;
        }

        try {
          // Decode audio to Float32Array for Whisper
          console.log('📝 Transcribing...');
          const audioData = await this._decodeAudioBlob(audioBlob);
          
          // Transcribe with Whisper
          const result = await this.whisperPipeline(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            sampling_rate: 16000,
          });

          const transcript = result.text?.trim() || '';
          console.log('Transcription:', transcript);
          
          this.updateState({ 
            currentTranscript: transcript, 
            isTranscribing: false, 
            status: 'ready' 
          });
          resolve(transcript);
        } catch (error) {
          console.error('Transcription error:', error);
          this.updateState({ 
            isTranscribing: false, 
            status: 'error',
            error: 'Transcription failed' 
          });
          resolve('');
        }
      };

      this.mediaRecorder!.stop();
    });
  }

  /**
   * Decode audio blob to Float32Array at 16kHz for Whisper
   */
  private async _decodeAudioBlob(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();
    
    // Create offline audio context at 16kHz (Whisper's expected sample rate)
    const audioContext = new OfflineAudioContext(1, 16000 * 30, 16000);
    
    // Decode the audio
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Resample to 16kHz if needed
    const offlineContext = new OfflineAudioContext(
      1, 
      Math.ceil(audioBuffer.duration * 16000), 
      16000
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    const resampledBuffer = await offlineContext.startRendering();
    const audioData = resampledBuffer.getChannelData(0);
    
    console.log(`[Whisper] Audio decoded: ${audioData.length} samples at 16kHz (${(audioData.length / 16000).toFixed(2)}s)`);
    
    return audioData;
  }

  /**
   * Get current transcript (for real-time display)
   */
  getCurrentTranscript(): string {
    return this.state.currentTranscript;
  }

  // ===========================================================================
  // TEXT-TO-SPEECH (Piper)
  // ===========================================================================

  /**
   * Internal Piper synthesis using piper-wasm
   */
  private async _synthesizeWithPiper(text: string, voice: PiperVoice, isWarmup = false): Promise<string> {
    // Paths to piper-wasm assets
    const piperPhonemizeJsUrl = `${this.piperBasePath}/piper_phonemize.js`;
    const piperPhonemizeWasmUrl = `${this.piperBasePath}/piper_phonemize.wasm`;
    const piperPhonemizeDataUrl = `${this.piperBasePath}/piper_phonemize.data`;
    const workerUrl = `${this.piperBasePath}/piper_worker.js`;
    
    // Model URLs from HuggingFace
    const modelUrl = `${HF_BASE}${voice.modelPath}`;
    const modelConfigUrl = `${HF_BASE}${voice.modelPath}.json`;

    if (!isWarmup) {
      console.log(`[Piper] Synthesizing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    }

    const result = await piperGenerate(
      piperPhonemizeJsUrl,
      piperPhonemizeWasmUrl,
      piperPhonemizeDataUrl,
      workerUrl,
      modelUrl,
      modelConfigUrl,
      null, // speakerId (null for single-speaker models)
      text,
      (progress: number) => {
        if (!isWarmup) {
          console.log(`TTS Progress: ${Math.round(progress * 100)}%`);
        }
      },
      null, // phonemeIds (let piper-wasm generate them using espeak-ng)
      false // inferEmotion
    );

    return result.file;
  }

  /**
   * Speak text using Piper TTS
   */
  async speak(options: TTSOptions): Promise<void> {
    const { 
      text, 
      voice = this.config.voice,
      onStart, 
      onEnd, 
      onError 
    } = options;

    if (!text.trim()) return;

    this.stopSpeaking();

    // Limit text length to prevent memory issues
    let processedText = text;
    if (processedText.length > 500) {
      console.warn('⚠️ Text too long, truncating to 500 characters');
      processedText = processedText.substring(0, 500);
    }

    try {
      this.updateState({ isSpeaking: true, status: 'speaking' });
      onStart?.();

      console.log('🔊 Generating speech with Piper...', voice.name);

      // Generate audio with Piper
      const audioUrl = await this._synthesizeWithPiper(processedText, voice);

      // Play the audio
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.playbackRate = this.config.speed;
      this.currentAudio.volume = this.config.volume;

      this.currentAudio.onended = () => {
        this.updateState({ isSpeaking: false, status: 'ready' });
        onEnd?.();
      };

      this.currentAudio.onerror = () => {
        this.updateState({ isSpeaking: false, status: 'error' });
        onError?.(new Error('Audio playback failed'));
      };

      await this.currentAudio.play();
      console.log('🔊 Playing...');

    } catch (error) {
      console.error('TTS error:', error);
      this.updateState({ 
        isSpeaking: false, 
        status: 'error',
        error: 'Speech generation failed' 
      });
      onError?.(error as Error);
    }
  }

  /**
   * Stop current speech
   */
  stopSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    if (this.state.isSpeaking) {
      this.updateState({ isSpeaking: false, status: 'ready' });
    }
  }

  // ===========================================================================
  // AUDIO VISUALIZATION
  // ===========================================================================

  private setupAudioVisualization(stream: MediaStream): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      source.connect(this.analyser);
    } catch (error) {
      console.warn('Audio visualization setup failed:', error);
    }
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  getWaveformData(): Uint8Array | null {
    if (!this.analyser) return null;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    return dataArray;
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

  getAvailableVoices(): PiperVoice[] {
    return PIPER_VOICES;
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
    this.stopSpeaking();
    
    if (this.mediaRecorder && this.state.isListening) {
      this.mediaRecorder.stop();
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.whisperPipeline = null;
    this.listeners.clear();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const voiceService = new VoiceService();
export default voiceService;
