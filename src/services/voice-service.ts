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
import { invoke } from '@tauri-apps/api/core';

interface NativeSttResult {
  text: string;
  confidence: number;
  segments: number;
}

// Configure transformers.js for browser
env.allowLocalModels = true;
// Allow remote fallback on first install so models can be downloaded and cached.
env.allowRemoteModels = true;
env.localModelPath = '/models/transformers';
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
  private usingWebSpeechSTT = false;
  private speechRecognition: any = null;
  private speechTranscriptFinal = '';
  private speechStopResolver: ((transcript: string) => void) | null = null;
  private speechStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private nativeVoiceAvailable: boolean | null = null;
  private whisperCppAvailable: boolean | null = null;
  private nativePiperAvailable: boolean | null = null;
  private preferWebSpeechWhenOnline = true;
  private lowLatencyMode = true;
  private maxSttAudioSeconds = 6;
  private maxTranscriptionMs = 12000;
  private sttSuppressUntil = 0;
  private playbackSttCooldownMs = 1600;
  
  // Piper base path for WASM assets
  private piperBasePath = '/wasm/piper';

  // Local model roots for fully offline usage.
  private whisperModelId = 'onnx-community/whisper-tiny.en';
  private localPiperModelBasePath = '/models/piper';
  private remotePiperModelBasePath = HF_BASE;
  
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
    speed: 0.9,
    volume: 0.8,
  };

  private listeners: Set<(state: VoiceServiceState) => void> = new Set();

  private isTauriAvailable(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  private async isNativeVoiceAvailable(): Promise<boolean> {
    if (!this.isTauriAvailable()) return false;
    if (this.nativeVoiceAvailable !== null) {
      return this.nativeVoiceAvailable;
    }

    try {
      const isAvailable = await invoke<boolean>('native_voice_is_available');
      this.nativeVoiceAvailable = Boolean(isAvailable);
    } catch {
      this.nativeVoiceAvailable = false;
    }

    return this.nativeVoiceAvailable;
  }

  private async isWhisperCppAvailable(): Promise<boolean> {
    if (!this.isTauriAvailable()) return false;
    if (this.whisperCppAvailable !== null) {
      return this.whisperCppAvailable;
    }

    try {
      const available = await invoke<boolean>('native_whisper_cpp_is_available');
      this.whisperCppAvailable = Boolean(available);
    } catch {
      this.whisperCppAvailable = false;
    }

    return this.whisperCppAvailable;
  }

  private async isNativePiperAvailable(voiceId?: string): Promise<boolean> {
    if (!this.isTauriAvailable()) return false;

    if (voiceId && voiceId !== this.config.voice.id) {
      try {
        return await invoke<boolean>('native_piper_is_available', { voiceId });
      } catch {
        return false;
      }
    }

    if (this.nativePiperAvailable !== null) {
      return this.nativePiperAvailable;
    }

    try {
      const available = await invoke<boolean>('native_piper_is_available', {
        voiceId: this.config.voice.id,
      });
      this.nativePiperAvailable = Boolean(available);
    } catch {
      this.nativePiperAvailable = false;
    }

    return this.nativePiperAvailable;
  }

  private float32To16BitPCM(data: Float32Array): Int16Array {
    const pcm = new Int16Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  private encodeWavBase64(audioData: Float32Array, sampleRate = 16000): string {
    const pcm = this.float32To16BitPCM(audioData);
    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcm.length * 2, true);

    let offset = 44;
    for (let i = 0; i < pcm.length; i += 1) {
      view.setInt16(offset, pcm[i], true);
      offset += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async transcribeWithNativeWav(audioData: Float32Array): Promise<NativeSttResult> {
    const wavBase64 = this.encodeWavBase64(audioData, 16000);
    return invoke<NativeSttResult>('native_voice_transcribe_wav_base64', {
      wavBase64,
      locale: 'en-US',
    });
  }

  private async transcribeWithWhisperCppWav(audioData: Float32Array): Promise<string> {
    const wavBase64 = this.encodeWavBase64(audioData, 16000);
    return invoke<string>('native_whisper_cpp_transcribe_wav_base64', {
      wavBase64,
    });
  }

  private limitAudioForFastStt(audioData: Float32Array, sampleRate = 16000): Float32Array {
    if (!this.lowLatencyMode || this.maxSttAudioSeconds <= 0) {
      return audioData;
    }

    const maxSamples = Math.floor(sampleRate * this.maxSttAudioSeconds);
    if (audioData.length <= maxSamples) {
      return audioData;
    }

    // Keep the most recent speech window to prioritize quick conversational turn-taking.
    return audioData.slice(audioData.length - maxSamples);
  }

  private sanitizeTranscript(text: string): string {
    return text
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isLikelyLowQualityTranscript(text: string): boolean {
    const cleaned = this.sanitizeTranscript(text);
    if (!cleaned) return true;

    const lowered = cleaned.toLowerCase();
    const hallucinationPatterns = [
      /thanks\s+for\s+watching/,
      /like\s+and\s+subscribe/,
      /subscribe\s+for\s+more/,
      /(show|watch)(ing)?\s+(video|videos)/,
      /turn\s+on\s+notifications/,
      /subtitles?/,
    ];
    if (hallucinationPatterns.some((pattern) => pattern.test(lowered))) {
      return true;
    }

    const tokens = lowered.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return cleaned.length < 2;

    const uniqueTokens = new Set(tokens);
    const uniquenessRatio = uniqueTokens.size / tokens.length;
    const tokenCounts = new Map<string, number>();
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }

    const mostCommonTokenCount = Math.max(...tokenCounts.values());
    const mostCommonTokenRatio = mostCommonTokenCount / tokens.length;

    // Long unpunctuated output is usually hallucinated from noise/silence.
    const longUnpunctuated = cleaned.length > 260 && !/[.!?]/.test(cleaned);

    // Very repetitive output tends to indicate poor recognition on noisy input.
    return (
      uniquenessRatio < 0.35
      || mostCommonTokenRatio > 0.28
      || longUnpunctuated
    );
  }

  private computeAudioRms(audioData: Float32Array): number {
    if (!audioData.length) return 0;

    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i += 1) {
      const sample = audioData[i];
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / audioData.length);
  }

  private decodeBase64ToUint8Array(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private async playWavBase64(base64Wav: string, onEnd?: () => void, onError?: (error: Error) => void): Promise<void> {
    const bytes = this.decodeBase64ToUint8Array(base64Wav);
    const wavBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(wavBuffer).set(bytes);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);

    this.currentAudio = new Audio(audioUrl);
    this.currentAudio.playbackRate = this.config.speed;
    this.currentAudio.volume = this.config.volume;

    this.currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      this.updateState({ isSpeaking: false, status: 'ready' });
      onEnd?.();
    };

    this.currentAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      this.updateState({ isSpeaking: false, status: 'error' });
      onError?.(new Error('Native audio playback failed'));
    };

    await this.currentAudio.play();
  }

  private isWebSpeechSTTAvailable(): boolean {
    const globalWindow = window as typeof window & {
      webkitSpeechRecognition?: any;
      SpeechRecognition?: any;
    };
    return Boolean(globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition);
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  private shouldUseWebSpeechSTT(): boolean {
    return this.preferWebSpeechWhenOnline && this.isOnline() && this.isWebSpeechSTTAvailable();
  }

  private shouldUseWebSpeechTTS(): boolean {
    const hasBrowserTts =
      typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof SpeechSynthesisUtterance !== 'undefined';
    return this.preferWebSpeechWhenOnline && this.isOnline() && hasBrowserTts;
  }

  private suppressSttForPlayback(extraMs = this.playbackSttCooldownMs): void {
    this.sttSuppressUntil = Date.now() + Math.max(0, extraMs);
  }

  private isSttSuppressed(): boolean {
    return Date.now() < this.sttSuppressUntil;
  }

  private stopListeningImmediately(): void {
    if (this.speechStopTimeout) {
      clearTimeout(this.speechStopTimeout);
      this.speechStopTimeout = null;
    }

    if (this.speechRecognition) {
      try {
        this.speechRecognition.abort?.();
      } catch {
        // ignore abort errors
      }
      try {
        this.speechRecognition.stop?.();
      } catch {
        // ignore stop errors
      }
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      } catch {
        // ignore recorder stop errors
      }
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.audioChunks = [];
    this.speechTranscriptFinal = '';
    this.updateState({
      isListening: false,
      isTranscribing: false,
      status: this.state.isSpeaking ? 'speaking' : 'ready',
      currentTranscript: this.state.currentTranscript,
    });
  }

  private async speakWithWebSpeech(
    text: string,
    onEnd?: () => void,
    onError?: (error: Error) => void,
  ): Promise<boolean> {
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      return false;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.config.speed;
      utterance.volume = this.config.volume;
      utterance.lang = 'en-US';

      const voices = synthesis.getVoices();
      const preferredVoice = voices.find((voiceOption) => /en-US|en-GB/i.test(voiceOption.lang));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          utterance.onend = null;
          utterance.onerror = null;
          resolve(ok);
        };

        const timeoutId = setTimeout(() => {
          this.suppressSttForPlayback();
          this.updateState({ isSpeaking: false, status: 'error', error: 'Browser speech synthesis timed out' });
          onError?.(new Error('Browser speech synthesis timed out'));
          settle(false);
        }, 60000);

        utterance.onend = () => {
          this.suppressSttForPlayback();
          this.updateState({ isSpeaking: false, status: 'ready', error: null });
          onEnd?.();
          settle(true);
        };

        utterance.onerror = () => {
          this.suppressSttForPlayback();
          this.updateState({ isSpeaking: false, status: 'error', error: 'Browser speech synthesis failed' });
          onError?.(new Error('Browser speech synthesis failed'));
          settle(false);
        };

        synthesis.cancel();
        synthesis.speak(utterance);
      });
    } catch {
      return false;
    }
  }

  private ensureSpeechRecognition(): boolean {
    if (this.speechRecognition) return true;

    const globalWindow = window as typeof window & {
      webkitSpeechRecognition?: any;
      SpeechRecognition?: any;
    };
    const SpeechRecognitionCtor = globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return false;

    this.speechRecognition = new SpeechRecognitionCtor();
    // One-shot recognition is more reliable to stop/finalize in desktop webviews.
    this.speechRecognition.continuous = false;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = 'en-US';

    const finalizeSpeechStop = (fallbackTranscript?: string) => {
      if (this.speechStopTimeout) {
        clearTimeout(this.speechStopTimeout);
        this.speechStopTimeout = null;
      }

      const resolvedTranscript = (
        fallbackTranscript
        ?? this.state.currentTranscript
        ?? this.speechTranscriptFinal
        ?? ''
      ).trim();

      this.updateState({
        isListening: false,
        isTranscribing: false,
        status: 'ready',
      });

      if (this.speechStopResolver) {
        const resolve = this.speechStopResolver;
        this.speechStopResolver = null;
        resolve(resolvedTranscript);
      }
    };

    this.speechRecognition.onresult = (event: any) => {
      if (this.state.isSpeaking || this.isSttSuppressed()) {
        return;
      }

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcriptPart = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          this.speechTranscriptFinal = `${this.speechTranscriptFinal} ${transcriptPart}`.trim();
        } else {
          interim += transcriptPart;
        }
      }

      const merged = `${this.speechTranscriptFinal} ${interim}`.trim();
      this.updateState({ currentTranscript: merged });
    };

    this.speechRecognition.onerror = (event: any) => {
      console.warn('[WebSpeech STT] Error:', event?.error || event);
      finalizeSpeechStop();
    };

    this.speechRecognition.onend = () => {
      finalizeSpeechStop();
    };

    return true;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${context} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize Whisper STT model (WebGPU/WASM accelerated)
   */
  async initializeSTT(): Promise<boolean> {
    if (this.state.sttLoaded) return true;

    if (this.shouldUseWebSpeechSTT() && this.ensureSpeechRecognition()) {
      this.usingWebSpeechSTT = true;
      this.updateState({
        sttLoaded: true,
        loadProgress: 100,
        status: 'ready',
        error: null,
      });
      console.log('✅ Web Speech API initialized as primary STT');
      return true;
    }

    try {
      this.updateState({ status: 'loading-stt', loadProgress: 0 });
      console.log('🎤 Loading Whisper Tiny model (fastest)...');

      // Try WebGPU first, fallback to WASM
      let device: 'webgpu' | 'wasm' = 'wasm';
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            device = 'webgpu';
            console.log('✅ Using WebGPU acceleration');
          }
        }
      } catch {
        console.log('⚠️ WebGPU unavailable, using WASM');
      }

      console.log(`[Whisper] Device: ${device.toUpperCase()}`);

      // Load Whisper tiny - smallest and fastest model (~39MB)
      // Using q8 (int8) quantization for best compatibility
      this.whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        this.whisperModelId,
        {
          device,
          dtype: 'q8', // int8 quantization - best compatibility
          progress_callback: (progress: any) => {
            if (progress.status === 'progress' && progress.progress !== undefined) {
              const percent = Math.round(progress.progress);
              this.updateState({ loadProgress: percent });
              console.log(`Loading Whisper: ${percent}%`);
            }
          },
        }
      );

      this.usingWebSpeechSTT = false;
      this.updateState({ sttLoaded: true, loadProgress: 100, error: null });
      console.log('✅ Whisper Tiny initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize STT:', error);
      if (this.isWebSpeechSTTAvailable() && this.ensureSpeechRecognition()) {
        this.usingWebSpeechSTT = true;
        this.updateState({
          sttLoaded: true,
          loadProgress: 100,
          status: 'ready',
          error: 'Whisper unavailable. Using browser STT fallback.',
        });
        console.warn('⚠️ Whisper unavailable, switched to browser STT fallback');
        return true;
      }

      this.updateState({
        status: 'error',
        error: 'Failed to load Whisper model. Connect once to download model files, then voice works offline.',
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

      // Warmup with a small test to preload WASM and model.
      // Use a timeout so UI never gets stuck if worker/model loading hangs.
      await this.withTimeout(
        this._synthesizeWithPiper('test', this.config.voice, true),
        25000,
        'Piper warmup'
      );

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
    } else if (sttOk) {
      // Keep session usable if STT is ready but TTS had warmup issues.
      this.updateState({ status: 'ready' });
    } else {
      this.updateState({ status: 'error', error: this.state.error || 'Voice initialization failed' });
    }
    
    return sttOk;
  }

  // Backward-compatible preload API used by auth/session bootstrap.
  async preloadForSession(): Promise<boolean> {
    return this.initialize();
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

    if (this.shouldUseWebSpeechSTT()) {
      this.usingWebSpeechSTT = this.ensureSpeechRecognition();
    } else if (this.usingWebSpeechSTT) {
      this.usingWebSpeechSTT = false;
    }

    if (this.state.isListening) return true;

    if (this.usingWebSpeechSTT) {
      if (!this.ensureSpeechRecognition()) {
        this.updateState({ error: 'No STT engine available on this device' });
        return false;
      }

      if (this.state.isSpeaking || this.isSttSuppressed()) {
        return false;
      }

      try {
        this.speechTranscriptFinal = '';
        this.updateState({ isListening: true, status: 'listening', currentTranscript: '', error: null });
        this.speechRecognition.start();
        console.log('🎤 Listening with browser STT fallback...');
        return true;
      } catch (error) {
        console.error('Failed to start browser STT:', error);
        this.updateState({ isListening: false, status: 'ready', error: 'Could not start speech recognition' });
        return false;
      }
    }

    try {
      if (this.state.isSpeaking || this.isSttSuppressed()) {
        return false;
      }

      if (!this.whisperPipeline) {
        const sttReady = await this.initializeSTT();
        if (!sttReady || !this.whisperPipeline) {
          this.updateState({ error: 'Offline STT fallback is not ready' });
          return false;
        }
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      this.audioChunks = [];
      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const selectedMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      this.mediaRecorder = selectedMimeType
        ? new MediaRecorder(this.mediaStream, { mimeType: selectedMimeType })
        : new MediaRecorder(this.mediaStream);

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
      if (this.usingWebSpeechSTT && this.speechRecognition) {
        return new Promise((resolve) => {
          this.speechStopResolver = resolve;

          if (this.speechStopTimeout) {
            clearTimeout(this.speechStopTimeout);
          }
          this.speechStopTimeout = setTimeout(() => {
            const fallbackTranscript = (
              this.state.currentTranscript
              || this.speechTranscriptFinal
              || ''
            ).trim();

            this.updateState({
              isListening: false,
              isTranscribing: false,
              status: 'ready',
            });

            if (this.speechStopResolver) {
              const timeoutResolve = this.speechStopResolver;
              this.speechStopResolver = null;
              timeoutResolve(fallbackTranscript);
            }

            this.speechStopTimeout = null;
          }, 1600);

          try {
            this.speechRecognition.stop();
          } catch {
            if (this.speechStopTimeout) {
              clearTimeout(this.speechStopTimeout);
              this.speechStopTimeout = null;
            }
            this.updateState({
              isListening: false,
              isTranscribing: false,
              status: 'ready',
            });
            const fallbackTranscript = (
              this.state.currentTranscript
              || this.speechTranscriptFinal
              || ''
            ).trim();
            this.speechStopResolver = null;
            resolve(fallbackTranscript);
          }
        });
      }

      return this.state.currentTranscript;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (value: string) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const hardTimeout = setTimeout(() => {
        console.warn(`[STT] Hard timeout after ${this.maxTranscriptionMs}ms. Resetting state.`);
        this.updateState({
          isTranscribing: false,
          isListening: false,
          status: 'ready',
          error: 'Transcription timed out. Please try again.',
        });
        resolveOnce('');
      }, this.maxTranscriptionMs);

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
          clearTimeout(hardTimeout);
          resolveOnce('');
          return;
        }

        try {
          // Decode audio to Float32Array for Whisper
          console.log('📝 Transcribing...');
          const decodedAudioData = await this._decodeAudioBlob(audioBlob);
          const audioData = this.limitAudioForFastStt(decodedAudioData);

          if (this.state.isSpeaking || this.isSttSuppressed()) {
            this.updateState({ isTranscribing: false, status: 'ready' });
            clearTimeout(hardTimeout);
            resolveOnce('');
            return;
          }

          const audioRms = this.computeAudioRms(audioData);

          if (audioRms < 0.008) {
            console.log(`[STT] Audio energy too low (RMS=${audioRms.toFixed(5)}), ignoring as silence/noise.`);
            this.updateState({
              currentTranscript: '',
              isTranscribing: false,
              status: 'ready',
              error: null,
            });
            clearTimeout(hardTimeout);
            resolveOnce('');
            return;
          }

          if (await this.isWhisperCppAvailable()) {
            try {
              const whisperCppTranscript = (
                await this.withTimeout(
                  this.transcribeWithWhisperCppWav(audioData),
                  3500,
                  'Whisper.cpp transcription'
                )
              ).trim();
              if (whisperCppTranscript && !this.isLikelyLowQualityTranscript(whisperCppTranscript)) {
                this.updateState({
                  currentTranscript: whisperCppTranscript,
                  isTranscribing: false,
                  status: 'ready',
                  error: null,
                });
                clearTimeout(hardTimeout);
                resolveOnce(whisperCppTranscript);
                return;
              }
              console.warn('[Whisper.cpp] Returned low quality/empty result. Falling back.');
            } catch (whisperCppError) {
              console.warn('[Whisper.cpp] Failed, falling back:', whisperCppError);
            }
          }

          if (await this.isNativeVoiceAvailable()) {
            try {
              const nativeResult = await this.withTimeout(
                this.transcribeWithNativeWav(audioData),
                2500,
                'Native STT transcription'
              );
              const nativeTranscript = this.sanitizeTranscript(nativeResult.text);
              const confidentEnough = nativeResult.confidence >= 0.45;
              const qualityLooksGood = !this.isLikelyLowQualityTranscript(nativeTranscript);

              if (nativeTranscript && confidentEnough && qualityLooksGood) {
                this.updateState({
                  currentTranscript: nativeTranscript,
                  isTranscribing: false,
                  status: 'ready',
                  error: null,
                });
                clearTimeout(hardTimeout);
                resolveOnce(nativeTranscript);
                return;
              }

              console.warn(
                `[Native STT] Low quality detected (confidence=${nativeResult.confidence.toFixed(2)}). Falling back to Whisper.`
              );
            } catch (nativeError) {
              console.warn('[Native STT] Failed, falling back to Whisper:', nativeError);
            }
          }

          if (!this.whisperPipeline) {
            await this.initializeSTT();
          }

          if (!this.whisperPipeline) {
            this.updateState({
              isTranscribing: false,
              status: 'error',
              error: 'No STT engine available for fallback transcription',
            });
            clearTimeout(hardTimeout);
            resolveOnce('');
            return;
          }
          
          // Transcribe with Whisper
          const result = (await this.withTimeout(
            this.whisperPipeline(audioData, {
              chunk_length_s: this.lowLatencyMode ? 6 : 30,
              stride_length_s: this.lowLatencyMode ? 1 : 5,
              return_timestamps: false,
              sampling_rate: 16000,
            }),
            this.lowLatencyMode ? 4500 : 15000,
            'Whisper WASM transcription'
          )) as { text?: string };

          const transcript = this.sanitizeTranscript(result.text || '');
          console.log('Transcription:', transcript);

          if (this.state.isSpeaking || this.isSttSuppressed()) {
            this.updateState({ isTranscribing: false, status: 'ready', error: null });
            clearTimeout(hardTimeout);
            resolveOnce('');
            return;
          }

          if (this.isLikelyLowQualityTranscript(transcript)) {
            console.warn('[Whisper WASM] Rejected low-quality transcript.');
            this.updateState({
              currentTranscript: '',
              isTranscribing: false,
              status: 'ready',
              error: null,
            });
            clearTimeout(hardTimeout);
            resolveOnce('');
            return;
          }
          
          this.updateState({ 
            currentTranscript: transcript, 
            isTranscribing: false, 
            status: 'ready' 
          });
          clearTimeout(hardTimeout);
          resolveOnce(transcript);
        } catch (error) {
          console.error('Transcription error:', error);
          if (this.isWebSpeechSTTAvailable() && this.ensureSpeechRecognition()) {
            this.usingWebSpeechSTT = true;
            this.updateState({
              isTranscribing: false,
              status: 'ready',
              error: 'Whisper internal error. Switched to browser STT fallback.',
            });
          } else {
            this.updateState({
              isTranscribing: false,
              status: 'error',
              error: 'Transcription failed',
            });
          }
          clearTimeout(hardTimeout);
          resolveOnce('');
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
    
    // Local-first model URLs with remote fallback for first-run download.
    const localModelUrl = `${this.localPiperModelBasePath}/${voice.id}.onnx`;
    const localModelConfigUrl = `${this.localPiperModelBasePath}/${voice.id}.onnx.json`;
    const remoteModelUrl = `${this.remotePiperModelBasePath}${voice.modelPath}`;
    const remoteModelConfigUrl = `${this.remotePiperModelBasePath}${voice.modelPath}.json`;

    if (!isWarmup) {
      console.log(`[Piper] Synthesizing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    }

    const runSynthesis = async (modelUrl: string, modelConfigUrl: string) => {
      return piperGenerate(
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
    };

    let result;
    try {
      result = await this.withTimeout(
        runSynthesis(localModelUrl, localModelConfigUrl),
        20000,
        'Local Piper synthesis'
      );
    } catch (localError) {
      if (!isWarmup) {
        console.warn('[Piper] Local model not found. Downloading from remote for first-run cache...');
      }
      result = await this.withTimeout(
        runSynthesis(remoteModelUrl, remoteModelConfigUrl),
        30000,
        'Remote Piper synthesis'
      );
    }

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

    // Prevent microphone loopback: always end capture before playback starts.
    this.suppressSttForPlayback(this.playbackSttCooldownMs + 300);
    this.stopListeningImmediately();
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

      if (this.shouldUseWebSpeechTTS()) {
        const spoken = await this.speakWithWebSpeech(processedText, onEnd, onError);
        if (spoken) {
          console.log('🔊 Using Web Speech API as primary TTS');
          return;
        }
      }

      if (await this.isNativePiperAvailable(voice.id)) {
        try {
          const nativePiperWav = await invoke<string>('native_piper_tts', {
            text: processedText,
            voiceId: voice.id,
            speed: this.config.speed,
          });

          await this.playWavBase64(nativePiperWav, onEnd, onError);
          this.updateState({ error: null });
          console.log('🔊 Native Piper playback started');
          return;
        } catch (nativePiperError) {
          console.warn('[Native Piper] Failed, falling back to Piper WASM:', nativePiperError);
        }
      }

      console.log('🔊 Generating speech with Piper...', voice.name);

      // Generate audio with Piper
      const audioUrl = await this._synthesizeWithPiper(processedText, voice);

      // Play the audio
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.playbackRate = this.config.speed;
      this.currentAudio.volume = this.config.volume;

      this.currentAudio.onended = () => {
        this.suppressSttForPlayback();
        this.updateState({ isSpeaking: false, status: 'ready' });
        onEnd?.();
      };

      this.currentAudio.onerror = () => {
        this.suppressSttForPlayback();
        this.updateState({ isSpeaking: false, status: 'error' });
        onError?.(new Error('Audio playback failed'));
      };

      await this.currentAudio.play();
      console.log('🔊 Playing...');

    } catch (error) {
      console.error('TTS error:', error);
      if (await this.isNativeVoiceAvailable()) {
        try {
          const nativeWav = await invoke<string>('native_voice_tts', {
            text: processedText,
            voiceHint: voice.name,
            rate: this.config.speed,
            volume: this.config.volume,
          });

          await this.playWavBase64(nativeWav, onEnd, onError);
          this.updateState({ error: 'Piper unavailable. Using native TTS fallback.' });
          console.log('🔊 Native TTS playback started');
          return;
        } catch (nativeError) {
          console.warn('[Native TTS] Failed after Piper failure:', nativeError);
        }
      }

      if (await this.speakWithWebSpeech(processedText, onEnd, onError)) {
        this.updateState({ error: 'Piper failed. Using browser TTS fallback.' });
        return;
      }

      this.updateState({
        isSpeaking: false,
        status: 'error',
        error: 'Speech generation failed',
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

    this.suppressSttForPlayback();
    
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
