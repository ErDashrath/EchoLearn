/**
 * use-voice-chat — React hook for fast voice conversations
 * 
 * Features:
 * - VAD-gated speech detection (no false starts)
 * - Sentence-level TTS streaming (low latency)
 * - Interrupt handling (user can interrupt AI)
 * - RAG storage for voice transcripts
 * - Audio visualization
 * 
 * @module hooks/use-voice-chat
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { voiceChatService, VoiceChatState, VoiceChatConfig, VoiceTurn } from '@/services/voice-chat-service';

export interface UseVoiceChatOptions {
  autoInitialize?: boolean;
  sessionId?: string;
  systemPrompt?: string;
  storeInRAG?: boolean;
  onUserSpeech?: (transcript: string) => void;
  onAIResponse?: (response: string) => void;
  onTurnComplete?: (turn: { userText: string; aiText: string }) => void;
  onError?: (error: string) => void;
}

export interface UseVoiceChatReturn {
  // State
  state: VoiceChatState;
  isReady: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  vadActive: boolean;
  transcript: string;
  interimTranscript: string;
  turnCount: number;
  error: string | null;
  
  // Actions
  initialize: () => Promise<boolean>;
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<string>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  voiceTurn: () => Promise<{ userText: string; aiText: string } | null>;
  
  // Session
  startSession: (sessionId?: string) => void;
  endSession: () => VoiceTurn[];
  getTurns: () => VoiceTurn[];
  
  // Config
  setConfig: (config: Partial<VoiceChatConfig>) => void;
  getConfig: () => VoiceChatConfig;
  
  // Visualization
  getFrequencyData: () => Uint8Array | null;
  getWaveformData: () => Uint8Array | null;
}

export function useVoiceChat(options: UseVoiceChatOptions = {}): UseVoiceChatReturn {
  const {
    autoInitialize = false,
    sessionId,
    systemPrompt = 'You are a supportive mental health companion. Be warm, empathetic, and concise.',
    storeInRAG = true,
    onUserSpeech,
    onAIResponse,
    onTurnComplete,
    onError,
  } = options;
  
  const [state, setState] = useState<VoiceChatState>(voiceChatService.getState());
  const initializingRef = useRef(false);
  const systemPromptRef = useRef(systemPrompt);
  
  // Keep systemPrompt ref updated
  useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);
  
  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = voiceChatService.subscribe(setState);
    return unsubscribe;
  }, []);
  
  // Auto-initialize
  useEffect(() => {
    if (autoInitialize && state.status === 'idle' && !initializingRef.current) {
      initializingRef.current = true;
      voiceChatService.initialize().finally(() => {
        initializingRef.current = false;
      });
    }
  }, [autoInitialize, state.status]);
  
  // Start session on mount if sessionId provided
  useEffect(() => {
    if (sessionId) {
      voiceChatService.startSession(sessionId);
    }
  }, [sessionId]);
  
  // Handle errors
  useEffect(() => {
    if (state.error && onError) {
      onError(state.error);
    }
  }, [state.error, onError]);
  
  // Actions
  const initialize = useCallback(async (): Promise<boolean> => {
    return voiceChatService.initialize();
  }, []);
  
  const startListening = useCallback(async (): Promise<boolean> => {
    return voiceChatService.startListening(state.sessionId ?? undefined);
  }, [state.sessionId]);
  
  const stopListening = useCallback(async (): Promise<string> => {
    return voiceChatService.stopListening();
  }, []);
  
  const speak = useCallback(async (text: string): Promise<void> => {
    return voiceChatService.speak(text);
  }, []);
  
  const stopSpeaking = useCallback((): void => {
    voiceChatService.stopSpeaking();
  }, []);
  
  const voiceTurn = useCallback(async (): Promise<{ userText: string; aiText: string } | null> => {
    const result = await voiceChatService.voiceTurn(
      systemPromptRef.current,
      onUserSpeech,
      onAIResponse,
      storeInRAG
    );
    
    if (result) {
      onTurnComplete?.(result);
    }
    
    return result;
  }, [onUserSpeech, onAIResponse, onTurnComplete, storeInRAG]);
  
  const startSession = useCallback((sid?: string): void => {
    voiceChatService.startSession(sid);
  }, []);
  
  const endSession = useCallback((): VoiceTurn[] => {
    return voiceChatService.endSession();
  }, []);
  
  const getTurns = useCallback((): VoiceTurn[] => {
    return voiceChatService.getTurns();
  }, []);
  
  const setConfig = useCallback((config: Partial<VoiceChatConfig>): void => {
    voiceChatService.setConfig(config);
  }, []);
  
  const getConfig = useCallback((): VoiceChatConfig => {
    return voiceChatService.getConfig();
  }, []);
  
  const getFrequencyData = useCallback((): Uint8Array | null => {
    return voiceChatService.getFrequencyData();
  }, []);
  
  const getWaveformData = useCallback((): Uint8Array | null => {
    return voiceChatService.getWaveformData();
  }, []);
  
  return {
    // State
    state,
    isReady: state.status === 'ready',
    isListening: state.isListening,
    isSpeaking: state.isSpeaking,
    isProcessing: state.isProcessing,
    vadActive: state.vadActive,
    transcript: state.currentTranscript,
    interimTranscript: state.interimTranscript,
    turnCount: state.turnCount,
    error: state.error,
    
    // Actions
    initialize,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    voiceTurn,
    
    // Session
    startSession,
    endSession,
    getTurns,
    
    // Config
    setConfig,
    getConfig,
    
    // Visualization
    getFrequencyData,
    getWaveformData,
  };
}

export default useVoiceChat;
