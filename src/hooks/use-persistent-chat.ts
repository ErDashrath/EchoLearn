/**
 * F010: Persistent Chat Hook with Smart Memory
 * 
 * Combines WebLLM generation with persistent chat storage and
 * smart memory summarization for efficient context management.
 * 
 * Features:
 * - Persistent sessions in LocalForage
 * - Smart memory: recent messages + summary of older ones
 * - Auto-summarization using LLM
 * - Session management (create, load, delete)
 * 
 * @module hooks/use-persistent-chat
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  chatMemoryService,
  ChatSession,
  ChatMessage,
  MemoryContext,
  detectIntent,
  extractEntities,
  EntityMemory,
} from '@/services/chat-memory-service';
import { aiService } from '@/services/ai-service';
import type { AIGenerationConfig } from '@/services/providers/ai-provider';
import { mentalHealthPromptService, type DASS21Results } from '@/services/mental-health-prompt-service';
import { ttsService } from '@/lib/tts-service';

// =============================================================================
// TYPES
// =============================================================================

export interface PersistentChatOptions {
  userName?: string;
  dass21Results?: DASS21Results | null;
}

export interface PersistentChatReturn {
  // Session state
  session: ChatSession | null;
  sessions: ChatSession[];
  messages: ChatMessage[];
  memoryContext: MemoryContext | null;
  
  // Loading states
  isLoading: boolean;
  isGenerating: boolean;
  isSummarizing: boolean;
  
  // Model state
  selectedModel: string | null;
  
  // TTS state
  ttsEnabled: boolean;
  
  // Session actions
  createNewSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  loadAllSessions: () => Promise<void>;
  
  // Message actions
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  
  // Model actions
  selectModel: (modelId: string) => Promise<void>;
  
  // TTS actions
  toggleTTS: (enabled: boolean) => void;
  
  // Utilities
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

/**
 * Format RAG results into a compact context block.
 * Applies similarity threshold + deduplication against the recent window.
 */
const formatRetrievedHistory = (
  memory: Awaited<ReturnType<typeof aiService.searchSimilar>>,
  recentContentSet: ReadonlySet<string> = new Set(),
): string => {
  const sections: string[] = [];
  let charCount = 0;
  const MAX_RAG_CHARS = 400;
  const MIN_SCORE = 0.55;

  const isInRecentWindow = (content: string) => {
    const key = content.slice(0, 50).toLowerCase();
    return [...recentContentSet].some(r => r.includes(key) || key.includes(r));
  };

  if (memory.relevantMessages.length > 0) {
    const lines: string[] = [];
    for (const msg of memory.relevantMessages.slice(0, 3)) {
      if (msg.similarity < MIN_SCORE) continue;
      if (isInRecentWindow(msg.content)) continue;
      const line = `\u2022 ${msg.content.replace(/\s+/g, ' ').slice(0, 110)}`;
      if (charCount + line.length > MAX_RAG_CHARS) break;
      lines.push(line);
      charCount += line.length;
    }
    if (lines.length > 0) sections.push(`Past context:\n${lines.join('\n')}`);
  }

  if (memory.relevantJournals.length > 0 && charCount < MAX_RAG_CHARS) {
    const lines: string[] = [];
    for (const entry of memory.relevantJournals.slice(0, 1)) {
      if (entry.similarity < MIN_SCORE) continue;
      lines.push(`\u2022 ${entry.content.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
    if (lines.length > 0) sections.push(`Journal note:\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
};

const CONTROL_TOKEN_PATTERN = /<\|[^|>]+\|>/g;
const HEADER_ROLE_PATTERN = /(?:^|\n)\s*(system|user|assistant)\s*:?\s*$/gim;
const SYSTEM_LEAK_PATTERN = /(You are MindScribe|Core Guidelines|Communication Style|User Context|Crisis Protocol|Current Levels|Chat Session Guidelines)/gi;
const PARTIAL_CONTROL_PATTERN = /<\|$|^\|>|<\|[^|>]*$|^[^<]*\|>/;
const METADATA_LEAK_PATTERN = /^(Context:|Mental context:|Chat style:|Journal style:|Voice style:)/i;
const BRACKETED_ROLE_PATTERN = /\[\s*[a-z\s_-]*says?\s*\]:?\s*/gi;
const SEPARATOR_PATTERN = /^\s*[-*_]{3,}\s*$/gm;
const STREAM_FLUSH_INTERVAL_MS = 16;
const STREAM_MAX_UNITS_PER_FLUSH = 1;

const sanitizeModelOutput = (text: string): string => {
  return text
    .replace(CONTROL_TOKEN_PATTERN, '')
    .replace(HEADER_ROLE_PATTERN, '')
    .replace(BRACKETED_ROLE_PATTERN, '')
    .replace(SEPARATOR_PATTERN, '')
    .replace(SYSTEM_LEAK_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n');
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeForComparison = (text: string): string => {
  return text
    .toLowerCase()
    .replace(BRACKETED_ROLE_PATTERN, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const stripEchoedUserMessage = (text: string, userMessage: string): string => {
  const trimmedUserMessage = userMessage.trim();
  if (!trimmedUserMessage) return text;

  let cleaned = text;
  const exactUserPattern = new RegExp(escapeRegExp(trimmedUserMessage), 'gi');
  cleaned = cleaned.replace(exactUserPattern, '');

  const normalizedUser = normalizeForComparison(trimmedUserMessage);
  if (normalizedUser.length < 24) {
    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
  }

  const blocks = cleaned.split(/\n{2,}/);
  const filtered = blocks.filter((block) => {
    const normalizedBlock = normalizeForComparison(block);
    if (!normalizedBlock) return false;
    if (normalizedBlock === normalizedUser) return false;
    if (normalizedBlock.includes(normalizedUser)) return false;
    return true;
  });

  return filtered.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
};

const dedupeRepeatedParagraphs = (text: string): string => {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const uniqueBlocks: string[] = [];

  for (const block of blocks) {
    const key = normalizeForComparison(block);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueBlocks.push(block);
  }

  return uniqueBlocks.join('\n\n');
};

const dedupeRepeatedSentences = (text: string): string => {
  const sentences = text.match(/[^.!?]+[.!?]?/g);
  if (!sentences) return text.trim();

  const seen = new Set<string>();
  const uniqueSentences: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const key = normalizeForComparison(trimmed);
    const isLikelyMeaningfulSentence = key.length >= 18;
    if (isLikelyMeaningfulSentence && seen.has(key)) continue;

    if (isLikelyMeaningfulSentence) {
      seen.add(key);
    }
    uniqueSentences.push(trimmed);
  }

  return uniqueSentences
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
};

const cleanAssistantOutput = (text: string, userMessage: string): string => {
  const cleaned = dedupeRepeatedSentences(
    dedupeRepeatedParagraphs(
      stripEchoedUserMessage(
        sanitizeModelOutput(text),
        userMessage,
      ),
    ),
  );

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
};

const splitStreamUnits = (text: string): string[] => {
  if (!text) return [];
  return Array.from(text);
};

const shouldDropChunk = (chunk: string): boolean => {
  const c = chunk.trim();
  if (!c) return false;
  if (PARTIAL_CONTROL_PATTERN.test(c)) return true;
  if (METADATA_LEAK_PATTERN.test(c)) return true;
  return false;
};

// =============================================================================
// HOOK
// =============================================================================

export function usePersistentChat(options: PersistentChatOptions = {}): PersistentChatReturn {
  const { userName, dass21Results } = options;
  const { user } = useAuth();
  const { toast } = useToast();

  // Session state
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [memoryContext, setMemoryContext] = useState<MemoryContext | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Model state
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(ttsService.getEnabled());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ===========================================================================
  // AUTO-SELECT MODEL
  // ===========================================================================

  useEffect(() => {
    // Initial check
    const updateSelectedModel = async () => {
      try {
        await aiService.autoLoadMostRecentModel();
        const cachedModels = await aiService.getCachedModelsAsync();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
        }
      } catch (error) {
        const cachedModels = aiService.getCachedModels();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
        }
      }
    };

    updateSelectedModel();

    // Subscribe to model/cache changes — no more polling
    const unsubModel = aiService.on('modelChange', (data) => {
      if (data?.modelId) {
        setSelectedModel(data.modelId);
      }
    });
    const unsubCache = aiService.on('cacheChange', (cachedModels) => {
      if (Array.isArray(cachedModels) && cachedModels.length > 0 && !selectedModel) {
        setSelectedModel(cachedModels[0]);
      }
    });

    return () => { unsubModel(); unsubCache(); };
  }, [selectedModel]);

  // ===========================================================================
  // LOAD SESSIONS ON MOUNT
  // ===========================================================================

  useEffect(() => {
    if (user?.username) {
      loadAllSessions();
    }
  }, [user?.username]);

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  const loadAllSessions = useCallback(async () => {
    if (!user?.username) return;

    setIsLoading(true);
    try {
      const userSessions = await chatMemoryService.getUserSessions(user.username);
      setSessions(userSessions);

      if (userSessions.length === 0) {
        setSession(null);
        setMemoryContext(null);
        return;
      }

      const hasActiveSession = session
        ? userSessions.some(s => s.id === session.id)
        : false;

      const sessionToLoad = hasActiveSession
        ? userSessions.find(s => s.id === session!.id) || userSessions[0]
        : userSessions[0];

      setSession(sessionToLoad);
      setMemoryContext(chatMemoryService.getMemoryContext(sessionToLoad));
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, session?.id]);

  const createNewSession = useCallback(async () => {
    if (!user?.username) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to start a chat',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const newSession = await chatMemoryService.createSession(user.username);
      setSession(newSession);
      setMemoryContext(chatMemoryService.getMemoryContext(newSession));
      setSessions(prev => [newSession, ...prev]);
    } catch (error) {
      console.error('Failed to create session:', error);
      toast({
        title: 'Error',
        description: 'Failed to create new chat',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, toast]);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const loadedSession = await chatMemoryService.getSession(sessionId);
      if (loadedSession) {
        setSession(loadedSession);
        setMemoryContext(chatMemoryService.getMemoryContext(loadedSession));
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await chatMemoryService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (session?.id === sessionId) {
        setSession(null);
        setMemoryContext(null);
      }

      toast({
        title: 'Session deleted',
        description: 'Chat history has been removed',
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete session',
        variant: 'destructive',
      });
    }
  }, [session?.id, toast]);

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    let currentSession = session;

    // Create new session if needed
    if (!currentSession) {
      if (!user?.username) {
        toast({
          title: 'Not logged in',
          description: 'Please log in to chat',
          variant: 'destructive',
        });
        return;
      }
      currentSession = await chatMemoryService.createSession(user.username, content.slice(0, 50));
      setSessions(prev => [currentSession!, ...prev]);
    }

    // Add user message
    currentSession = await chatMemoryService.addMessage(currentSession, 'user', content);

    // Layer 2: Update entity memory (regex extraction — zero cost)
    currentSession.entityMemory = extractEntities(
      currentSession.entityMemory ?? null,
      currentSession.messages,
    );
    await chatMemoryService.saveSession(currentSession);

    setSession({ ...currentSession });
    setMemoryContext(chatMemoryService.getMemoryContext(currentSession));
    scrollToBottom();

    // Layer 1: Detect intent + index user message to vector store
    const intent = detectIntent(content);
    if (aiService.supportsRAG()) {
      try {
        await aiService.storeMessage(user?.username || 'anonymous', currentSession.id, 'user', content, intent);
      } catch (error) {
        console.warn('Failed to index user message for retrieval:', error);
      }
    }

    // Check if model is ready
    if (!selectedModel || !aiService.isModelLoaded()) {
      // Try to load if cached
      if (selectedModel && aiService.isModelCached(selectedModel)) {
        try {
          await aiService.loadModel(selectedModel);
        } catch (error) {
          toast({
            title: 'Model not ready',
            description: 'Please wait for the model to load',
            variant: 'destructive',
          });
          return;
        }
      } else {
        toast({
          title: 'No model selected',
          description: 'Please select and load a model first',
          variant: 'destructive',
        });
        return;
      }
    }

    // Generate AI response
    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history from recent window
      const memory = chatMemoryService.getMemoryContext(currentSession);
      const conversationHistory: { role: string; content: string }[] = [];
      memory.recentMessages.forEach(msg => {
        conversationHistory.push({ role: msg.role, content: msg.content });
      });

      const supportMode = intent === 'distress' || intent === 'crisis';

      // Generate personalized system prompt
      const systemPrompt = mentalHealthPromptService.generateSystemPrompt({
        userName,
        dass21Results,
        sessionType: 'chat',
        timeOfDay: mentalHealthPromptService.getTimeOfDay(),
        supportMode,
      });

      // Layer 3: Semantic RAG — only when there's enough history to be meaningful,
      // and only when the session has messages outside the recent window.
      const { recentWindowSize } = chatMemoryService.getConfig();
      const totalMsgs = currentSession.messages.filter(m => m.role !== 'system').length;
      const hasEnoughHistory = aiService.supportsRAG() && totalMsgs > recentWindowSize + 4;

      let ragFormatted = '';
      if (hasEnoughHistory) {
        try {
          // Build dedup set from recent window content
          const recentContentSet = new Set(
            memory.recentMessages.map(m => m.content.slice(0, 50).toLowerCase()),
          );
          const retrieved = await aiService.searchSimilar(content, user?.username || 'anonymous', 3);
          ragFormatted = formatRetrievedHistory(retrieved, recentContentSet);
        } catch {
          // RAG unavailable — fall through with no retrieval context
        }
      }

      // Build compact, budget-aware context packet (entity + summary + RAG)
      const contextPacket = chatMemoryService.buildContextPacket(currentSession, ragFormatted);

      // Check for crisis signals
      const hasCrisisSignals = mentalHealthPromptService.containsCrisisSignals(content);
      const contextAddition = contextPacket ? `\n\n${contextPacket}` : '';
      const finalSystemPrompt = hasCrisisSignals
        ? systemPrompt + contextAddition + mentalHealthPromptService.getCrisisResponseAddition()
        : systemPrompt + contextAddition;

      // Config for generation
      const config: AIGenerationConfig = {
        temperature: hasCrisisSignals ? 0.65 : 0.6,
        maxTokens: hasCrisisSignals ? 280 : 180,
        topP: 0.9,
      };

      // Create placeholder for AI message
      const aiMessagePlaceholder: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      
      // Temporarily add typing indicator
      const tempMessages = [...currentSession.messages, aiMessagePlaceholder];
      setSession({ ...currentSession, messages: tempMessages });

      // Stream the response
      let responseContent = '';
      let pendingStreamUnits: string[] = [];
      let streamFlushTimer: ReturnType<typeof setInterval> | null = null;
      let backendStreamCompleted = false;
      let resolveDrain: (() => void) | null = null;

      const resolveDrainIfReady = () => {
        if (!backendStreamCompleted || pendingStreamUnits.length > 0 || !resolveDrain) return;
        resolveDrain();
        resolveDrain = null;
      };

      const waitForStreamDrain = () => {
        if (pendingStreamUnits.length === 0) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          resolveDrain = resolve;
        });
      };

      const flushStreamBuffer = () => {
        if (pendingStreamUnits.length === 0) {
          resolveDrainIfReady();
          return;
        }

        let flushedContent = '';
        let flushedUnits = 0;

        while (pendingStreamUnits.length > 0 && flushedUnits < STREAM_MAX_UNITS_PER_FLUSH) {
          flushedContent += pendingStreamUnits.shift()!;
          flushedUnits += 1;
        }

        if (!flushedContent && pendingStreamUnits.length > 0) {
          flushedContent = pendingStreamUnits.shift()!;
        }

        responseContent += flushedContent;
        responseContent = cleanAssistantOutput(responseContent, content);

        const updatedMessages = [...currentSession.messages, {
          ...aiMessagePlaceholder,
          content: responseContent,
        }];
        setSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
        scrollToBottom();
        resolveDrainIfReady();
      };

      const startStreamFlushLoop = () => {
        if (streamFlushTimer) return;
        streamFlushTimer = setInterval(flushStreamBuffer, STREAM_FLUSH_INTERVAL_MS);
      };

      const stopStreamFlushLoop = () => {
        if (!streamFlushTimer) return;
        clearInterval(streamFlushTimer);
        streamFlushTimer = null;
      };

      startStreamFlushLoop();
      try {
        for await (const chunk of aiService.generateResponse(
          conversationHistory,
          config,
          finalSystemPrompt,
          currentSession.id,
          true // Enable RAG retrieval from stored messages
        )) {
          if (shouldDropChunk(chunk)) continue;

          const cleanedChunk = sanitizeModelOutput(chunk);
          if (!cleanedChunk && chunk.trim().length > 0) continue;

          pendingStreamUnits.push(...splitStreamUnits(cleanedChunk));
        }
        backendStreamCompleted = true;
        await waitForStreamDrain();
      } finally {
        backendStreamCompleted = true;
        flushStreamBuffer();
        await waitForStreamDrain();
        stopStreamFlushLoop();
      }

      responseContent = cleanAssistantOutput(responseContent, content);

      // Save the final AI message
      currentSession = await chatMemoryService.addMessage(
        currentSession,
        'assistant',
        responseContent
      );

      if (aiService.supportsRAG()) {
        try {
          await aiService.storeMessage(user?.username || 'anonymous', currentSession.id, 'assistant', responseContent, 'neutral');
        } catch (error) {
          console.warn('Failed to index assistant message for retrieval:', error);
        }
      }

      setSession({ ...currentSession });
      setMemoryContext(chatMemoryService.getMemoryContext(currentSession));

      // Update sessions list
      setSessions(prev => {
        const index = prev.findIndex(s => s.id === currentSession!.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = currentSession!;
          return updated;
        }
        return [currentSession!, ...prev];
      });

      // Check if summary update is needed
      if (chatMemoryService.needsSummaryUpdate(currentSession)) {
        await generateSummary(currentSession);
      }

      // TTS
      if (ttsEnabled && responseContent) {
        setTimeout(() => ttsService.speak(responseContent), 300);
      }

    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Generation error:', error);
        toast({
          title: 'Generation failed',
          description: 'Failed to generate AI response',
          variant: 'destructive',
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [session, user?.username, selectedModel, userName, dass21Results, ttsEnabled, toast, scrollToBottom]);

  // ===========================================================================
  // SUMMARIZATION
  // ===========================================================================

  const generateSummary = useCallback(async (targetSession: ChatSession) => {
    if (!aiService.isModelLoaded()) {
      // Use quick local summary as fallback
      const quickSummary = chatMemoryService.createQuickSummary(targetSession);
      targetSession.summary = quickSummary;
      await chatMemoryService.saveSession(targetSession);
      setSession({ ...targetSession });
      setMemoryContext(chatMemoryService.getMemoryContext(targetSession));
      return;
    }

    setIsSummarizing(true);

    try {
      const summaryPrompt = chatMemoryService.generateSummaryPrompt(targetSession);
      if (!summaryPrompt) {
        setIsSummarizing(false);
        return;
      }

      // Generate summary using LLM
      const config: AIGenerationConfig = {
        temperature: 0.3, // Lower for more factual summary
        maxTokens: 300,
        topP: 0.9,
      };

      let summaryResponse = '';
      for await (const chunk of aiService.generateResponse(
        [{ role: 'user', content: summaryPrompt }],
        config,
        undefined,
        undefined,
        false // No RAG for summary generation
      )) {
        summaryResponse += chunk;
      }

      // Update session with summary
      const updatedSession = await chatMemoryService.updateSummary(
        targetSession,
        summaryResponse
      );
      setSession({ ...updatedSession });
      setMemoryContext(chatMemoryService.getMemoryContext(updatedSession));

      console.log('📝 Conversation summarized:', updatedSession.summary);

    } catch (error) {
      console.error('Summary generation failed:', error);
      // Fallback to quick summary
      const quickSummary = chatMemoryService.createQuickSummary(targetSession);
      targetSession.summary = quickSummary;
      await chatMemoryService.saveSession(targetSession);
      setSession({ ...targetSession });
    } finally {
      setIsSummarizing(false);
    }
  }, []);

  // ===========================================================================
  // CONTROL ACTIONS
  // ===========================================================================

  const stopGeneration = useCallback(() => {
    aiService.stopGeneration();
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    toast({
      title: 'Stopped',
      description: 'AI response generation stopped',
    });
  }, [toast]);

  const selectModel = useCallback(async (modelId: string) => {
    if (!aiService.isModelCached(modelId)) {
      toast({
        title: 'Model not downloaded',
        description: 'Please download the model first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const success = await aiService.loadModel(modelId);
      if (success) {
        setSelectedModel(modelId);
        toast({
          title: 'Model loaded',
          description: `${modelId} is now active`,
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to load model',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const toggleTTS = useCallback((enabled: boolean) => {
    setTtsEnabled(enabled);
    ttsService.setEnabled(enabled);
  }, []);

  // ===========================================================================
  // RETURN
  // ===========================================================================

  // Extract messages for display
  const messages = session?.messages || [];

  return {
    // Session state
    session,
    sessions,
    messages,
    memoryContext,

    // Loading states
    isLoading,
    isGenerating,
    isSummarizing,

    // Model state
    selectedModel,

    // TTS state
    ttsEnabled,

    // Session actions
    createNewSession,
    loadSession,
    deleteSession,
    loadAllSessions,

    // Message actions
    sendMessage,
    stopGeneration,

    // Model actions
    selectModel,

    // TTS actions
    toggleTTS,

    // Utilities
    messagesEndRef,
  };
}

export default usePersistentChat;
