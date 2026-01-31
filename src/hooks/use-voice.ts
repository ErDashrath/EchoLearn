/**
 * F012-F016: Voice Therapy Hook
 * 
 * React hook for voice interactions in therapy sessions.
 * Provides easy-to-use interface for Whisper STT and Piper TTS.
 * 
 * @module hooks/use-voice
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  voiceService, 
  VoiceServiceState, 
  PiperVoice, 
  TTSOptions,
  PIPER_VOICES 
} from '@/services/voice-service';

export interface UseVoiceOptions {
  autoInitialize?: boolean;
  voice?: PiperVoice;
  onTranscript?: (transcript: string) => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

export interface UseVoiceReturn {
  // State
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  isLoading: boolean;
  isReady: boolean;
  sttLoaded: boolean;
  ttsLoaded: boolean;
  loadProgress: number;
  error: string | null;
  transcript: string;
  status: string;
  
  // Actions
  initialize: () => Promise<boolean>;
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<string>;
  speak: (text: string, options?: Partial<TTSOptions>) => Promise<void>;
  stopSpeaking: () => void;
  
  // Configuration
  setVoice: (voice: PiperVoice) => void;
  currentVoice: PiperVoice;
  availableVoices: PiperVoice[];
  
  // Visualization
  getFrequencyData: () => Uint8Array | null;
  getWaveformData: () => Uint8Array | null;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    autoInitialize = false,
    voice,
    onTranscript,
    onSpeakStart,
    onSpeakEnd,
  } = options;

  const [state, setState] = useState<VoiceServiceState>(voiceService.getState());
  const lastTranscriptRef = useRef<string>('');
  const initializingRef = useRef<boolean>(false);

  // Subscribe to voice service state
  useEffect(() => {
    const unsubscribe = voiceService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Auto-initialize if requested
  useEffect(() => {
    if (autoInitialize && !state.sttLoaded && !initializingRef.current) {
      initializingRef.current = true;
      voiceService.initialize().finally(() => {
        initializingRef.current = false;
      });
    }
  }, [autoInitialize, state.sttLoaded]);

  // Set initial voice
  useEffect(() => {
    if (voice) {
      voiceService.setConfig({ voice });
    }
  }, [voice]);

  // Handle transcript changes
  useEffect(() => {
    if (state.currentTranscript && state.currentTranscript !== lastTranscriptRef.current) {
      lastTranscriptRef.current = state.currentTranscript;
      onTranscript?.(state.currentTranscript);
    }
  }, [state.currentTranscript, onTranscript]);

  // Actions
  const initialize = useCallback(async (): Promise<boolean> => {
    return voiceService.initialize();
  }, []);

  const startListening = useCallback(async (): Promise<boolean> => {
    return voiceService.startListening();
  }, []);

  const stopListening = useCallback(async (): Promise<string> => {
    const transcript = await voiceService.stopListening();
    lastTranscriptRef.current = '';
    return transcript;
  }, []);

  const speak = useCallback(async (text: string, opts?: Partial<TTSOptions>): Promise<void> => {
    await voiceService.speak({
      text,
      ...opts,
      onStart: () => {
        onSpeakStart?.();
        opts?.onStart?.();
      },
      onEnd: () => {
        onSpeakEnd?.();
        opts?.onEnd?.();
      },
    });
  }, [onSpeakStart, onSpeakEnd]);

  const stopSpeaking = useCallback(() => {
    voiceService.stopSpeaking();
  }, []);

  const setVoice = useCallback((newVoice: PiperVoice) => {
    voiceService.setConfig({ voice: newVoice });
  }, []);

  const getFrequencyData = useCallback(() => {
    return voiceService.getFrequencyData();
  }, []);

  const getWaveformData = useCallback(() => {
    return voiceService.getWaveformData();
  }, []);

  // Compute derived state
  const isLoading = state.status === 'loading-stt' || state.status === 'loading-tts';
  const isReady = state.sttLoaded && state.ttsLoaded;

  return {
    // State
    isListening: state.isListening,
    isSpeaking: state.isSpeaking,
    isTranscribing: state.isTranscribing,
    isLoading,
    isReady,
    sttLoaded: state.sttLoaded,
    ttsLoaded: state.ttsLoaded,
    loadProgress: state.loadProgress,
    error: state.error,
    transcript: state.currentTranscript,
    status: state.status,
    
    // Actions
    initialize,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    
    // Configuration
    setVoice,
    currentVoice: voiceService.getConfig().voice,
    availableVoices: PIPER_VOICES,
    
    // Visualization
    getFrequencyData,
    getWaveformData,
  };
}

export default useVoice;
