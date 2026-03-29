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
} from '@/services/chat-memory-service';
import { deviceMemoryService } from '@/services/device-memory-service';
import { webllmService, type WebLLMGenerationConfig } from '@/services/webllm-service';
import { mentalHealthPromptService, type DASS21Results } from '@/services/mental-health-prompt-service';
import {
  inferenceRuntimeService,
  type InferenceProviderId,
  type InferenceSelectionMode,
  type InferenceRuntimeCapabilities,
} from '@/services/inference-runtime-service';
import {
  buildTrimmedConversationHistory,
  composeTurnPrompts,
  getRecommendedContextBudget,
  type PromptTurnMessage,
} from '@/services/llm-prompt-service';
import { nativeCpuInferenceService } from '@/services/native-cpu-inference-service';
import { modelVariantService } from '@/services/model-variant-service';
import { ttsService } from '@/lib/tts-service';

const GENERIC_REPLY_PATTERNS: RegExp[] = [
  /i\s*(am|'m)\s*sorry[^.!?]*didn'?t understand/i,
  /what can i assist you with today\??/i,
  /could you please clarify/i,
  /it seems like we have some confusion/i,
  /can i support you better\??/i,
];

const normalizeForCompare = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

const isLowQualityReply = (
  reply: string,
  userInput: string,
  recentMessages: ChatMessage[],
): boolean => {
  const trimmed = reply.trim();
  if (!trimmed) {
    return true;
  }

  if (GENERIC_REPLY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  const normalizedReply = normalizeForCompare(trimmed);
  if (normalizedReply.length < 24) {
    return true;
  }

  const normalizedInput = normalizeForCompare(userInput);
  if (normalizedInput && normalizedReply === normalizedInput) {
    return true;
  }

  const lastAssistant = [...recentMessages]
    .reverse()
    .find((message) => message.role === 'assistant')?.content;

  if (lastAssistant && normalizeForCompare(lastAssistant) === normalizedReply) {
    return true;
  }

  return false;
};

const buildRecoveryPrompt = (basePrompt: string): string => `${basePrompt}

## Immediate response correction
- Your previous draft was too generic or repetitive.
- Reply naturally like a friend: warm, specific, and useful.
- Include one reflective CBT-style question only when helpful.
- No stock phrases like "How can I assist you today?" or "Please clarify your query."
- If the user is casual, a light playful line is okay when respectful.`;

const stripNativeCliArtifacts = (raw: string, userInput?: string): string => {
  const ansiStripped = raw
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r/g, '');

  const filtered = ansiStripped
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      const lowerTrimmed = trimmed.toLowerCase();

      if (lowerTrimmed.startsWith('load_backend:')) return false;
      if (lowerTrimmed.startsWith('loading model')) return false;

      if (
        lowerTrimmed.startsWith('build') ||
        lowerTrimmed.startsWith('model') ||
        lowerTrimmed.startsWith('modalities')
      ) return false;

      if (
        lowerTrimmed.startsWith('available commands:') ||
        lowerTrimmed.startsWith('/exit') ||
        lowerTrimmed.startsWith('/regen') ||
        lowerTrimmed.startsWith('/clear') ||
        lowerTrimmed.startsWith('/read ') ||
        lowerTrimmed.startsWith('/glob ')
      ) return false;

      if (
        lowerTrimmed.startsWith('----- common params -----') ||
        lowerTrimmed.startsWith('----- sampling params -----') ||
        lowerTrimmed.startsWith('----- example-specific params -----')
      ) return false;

      if (lowerTrimmed.startsWith('[ prompt:')) return false;
      if (lowerTrimmed.startsWith('system:')) return false;
      if (lowerTrimmed.startsWith('user:') || lowerTrimmed.startsWith('assistant:')) return false;
      if (lowerTrimmed.startsWith('"user:') || lowerTrimmed.startsWith("'user:")) return false;
      if (trimmed === '>' || lowerTrimmed.startsWith('> you are ')) return false;
      if (/^"?(User|Assistant):\s*$/i.test(trimmed)) return false;
      if (/^[\u2580\u2584\u2588\s]+$/.test(trimmed)) return false;

      return true;
    })
    .map((line) => line.replace(/^\s*"?Assistant:\s*/i, ''))
    .join('\n')
    .replace(/^\s*"|"\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const normalized = filtered
    .replace(/^\s*"?user:.*$/gim, '')
    .replace(/^\s*"?assistant:\s*$/gim, '')
    .replace(/^\s*'user:.*$/gim, '')
    .replace(/^\s*'assistant:\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lastAssistantMatch = [...normalized.matchAll(/(?:^|\n)assistant:\s*/gim)].pop();
  if (lastAssistantMatch && typeof lastAssistantMatch.index === 'number') {
    const start = lastAssistantMatch.index + lastAssistantMatch[0].length;
    return normalized.slice(start).trim();
  }

  if (!userInput?.trim()) {
    return normalized;
  }

  const expected = normalizeForCompare(userInput);
  const remainingLines = normalized.split('\n');

  while (remainingLines.length > 0) {
    const first = remainingLines[0].trim();
    if (!first) {
      remainingLines.shift();
      continue;
    }

    const unquoted = first.replace(/^["'`\s]+|["'`\s]+$/g, '');
    const withoutRole = unquoted.replace(/^user:\s*/i, '');

    if (
      normalizeForCompare(unquoted) === expected ||
      normalizeForCompare(withoutRole) === expected
    ) {
      remainingLines.shift();
      continue;
    }

    break;
  }

  return remainingLines.join('\n').trim();
};

const enforceMindScribeIdentity = (raw: string): string => {
  let text = raw.trim();
  if (!text) {
    return text;
  }

  if (!/(qwen|alibaba cloud|alibaba)/i.test(text)) {
    return text;
  }

  text = text.replace(/\b(qwen|alibaba cloud|alibaba)\b/gi, 'MindScribe');

  text = text.replace(
    /\b(i am|i'm)\s+mindscribe,?\s+a\s+(large\s+language\s+model|language model)[^.]*\./i,
    'I am MindScribe, your privacy-first mental health companion.',
  );

  text = text.replace(
    /\b(i am|i'm)\s+mindscribe,?\s+created by\s+mindscribe[^.]*\./i,
    'I am MindScribe, your privacy-first mental health companion.',
  );

  return text.trim();
};
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
  inferenceSelectionMode: InferenceSelectionMode;
  setInferenceSelectionMode: (mode: InferenceSelectionMode) => void;
  activeInferenceProvider: InferenceProviderId | null;
  inferenceCapabilities: InferenceRuntimeCapabilities | null;
  
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

// =============================================================================
// HOOK
// =============================================================================

export function usePersistentChat(options: PersistentChatOptions = {}): PersistentChatReturn {
  const { userName, dass21Results } = options;
  const { user } = useAuth();
  const { toast } = useToast();
  const resolvedUserName = userName || user?.username;

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
  const [inferenceSelectionMode, setInferenceSelectionModeState] =
    useState<InferenceSelectionMode>(() => inferenceRuntimeService.getSelectionMode());
  const [activeInferenceProvider, setActiveInferenceProvider] = useState<InferenceProviderId | null>(null);
  const [inferenceCapabilities, setInferenceCapabilities] =
    useState<InferenceRuntimeCapabilities | null>(null);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(ttsService.getEnabled());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const capabilitiesRefreshInFlightRef = useRef(false);

  // ===========================================================================
  // AUTO-SELECT MODEL
  // ===========================================================================

  useEffect(() => {
    const updateSelectedModel = async () => {
      try {
        const cachedModels = await webllmService.getCachedModelsAsync();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
        }
      } catch (error) {
        const cachedModels = webllmService.getCachedModels();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
        }
      }
    };

    updateSelectedModel();
    const interval = setInterval(updateSelectedModel, 5000);
    return () => clearInterval(interval);
  }, [selectedModel]);

  // ===========================================================================
  // INFERENCE CAPABILITIES
  // ===========================================================================

  useEffect(() => {
    let mounted = true;

    const refreshCapabilities = async () => {
      if (capabilitiesRefreshInFlightRef.current) {
        return;
      }

      capabilitiesRefreshInFlightRef.current = true;
      try {
        const mappedNativeModelPath = modelVariantService.getNativeModelPath(selectedModel);
        const mappedNativeRuntimePath = modelVariantService.getNativeRuntimePath();
        const capabilities = await inferenceRuntimeService.getCapabilities(
          selectedModel ?? undefined,
          mappedNativeModelPath,
          mappedNativeRuntimePath,
        );
        if (!mounted) {
          return;
        }
        const provider = inferenceRuntimeService.resolveProvider(capabilities, inferenceSelectionMode);
        setInferenceCapabilities(capabilities);
        setActiveInferenceProvider(provider);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('Failed to refresh inference capabilities', error);
        }
      } finally {
        capabilitiesRefreshInFlightRef.current = false;
      }
    };

    refreshCapabilities();
    const interval = setInterval(refreshCapabilities, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [inferenceSelectionMode, selectedModel]);

  const setInferenceSelectionMode = useCallback((mode: InferenceSelectionMode) => {
    inferenceRuntimeService.setSelectionMode(mode);
    setInferenceSelectionModeState(mode);
    setActiveInferenceProvider((previous) => {
      if (!inferenceCapabilities) {
        return previous;
      }
      return inferenceRuntimeService.resolveProvider(inferenceCapabilities, mode);
    });
  }, [inferenceCapabilities]);

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
      if (user?.username) {
        await deviceMemoryService.deleteChatSessionMemories(user.username, sessionId);
      }
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
  }, [session?.id, toast, user?.username]);

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
    setSession({ ...currentSession });
    setMemoryContext(chatMemoryService.getMemoryContext(currentSession));
    scrollToBottom();

    if (user?.username) {
      const latestUserMessage = currentSession.messages[currentSession.messages.length - 1];
      await deviceMemoryService.upsertChatMessage(user.username, currentSession, latestUserMessage);
    }

    const directMemoryAnswer = user?.username
      ? await deviceMemoryService.answerFactQuestion(user.username, content)
      : null;

    if (directMemoryAnswer) {
      currentSession = await chatMemoryService.addMessage(
        currentSession,
        'assistant',
        directMemoryAnswer
      );
      setSession({ ...currentSession });
      setMemoryContext(chatMemoryService.getMemoryContext(currentSession));

      if (user?.username) {
        const latestAssistantMessage = currentSession.messages[currentSession.messages.length - 1];
        await deviceMemoryService.upsertChatMessage(
          user.username,
          currentSession,
          latestAssistantMessage
        );
      }

      setSessions(prev => {
        const index = prev.findIndex(s => s.id === currentSession!.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = currentSession!;
          return updated;
        }
        return [currentSession!, ...prev];
      });

      if (ttsEnabled) {
        setTimeout(() => ttsService.speak(directMemoryAnswer), 300);
      }

      scrollToBottom();
      return;
    }

    const mappedNativeModelPath = modelVariantService.getNativeModelPath(selectedModel);
    const mappedNativeRuntimePath = modelVariantService.getNativeRuntimePath();
    const capabilities = await inferenceRuntimeService.getCapabilities(
      selectedModel ?? undefined,
      mappedNativeModelPath,
      mappedNativeRuntimePath,
    );
    const selectedProvider = inferenceRuntimeService.resolveProvider(
      capabilities,
      inferenceSelectionMode,
    );
    setInferenceCapabilities(capabilities);
    setActiveInferenceProvider(selectedProvider);

    if (!selectedProvider) {
      const reasons = inferenceRuntimeService.getUnavailableReason(
        capabilities,
        inferenceSelectionMode,
      );

      toast({
        title: 'Unsupported device/runtime',
        description: reasons || 'No compatible local inference provider is available on this device.',
        variant: 'destructive',
      });
      return;
    }

    if (
      selectedProvider === 'webllm-webgpu' &&
      selectedModel &&
      webllmService.isModelCached(selectedModel) &&
      !webllmService.isModelLoaded()
    ) {
      try {
        await webllmService.loadModel(selectedModel);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('Local model unavailable, continuing with compatibility fallback', error);
        }
      }
    }

    // Generate AI response
    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history
      const memory = chatMemoryService.getMemoryContext(currentSession);
      const conversationHistoryRaw: PromptTurnMessage[] = [];

      // Add recent messages
      memory.recentMessages.forEach(msg => {
        conversationHistoryRaw.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      });

      const conversationHistory = buildTrimmedConversationHistory(conversationHistoryRaw, {
        maxTurns: 8,
        maxCharsPerMessage: 360,
      });

      const contextBudget = getRecommendedContextBudget(selectedModel, selectedProvider);

      const retrievedContext = user?.username
        ? await deviceMemoryService.buildContextForTurn({
            userId: user.username,
            query: content,
            sessionId: currentSession.id,
            recentMessages: memory.recentMessages,
            limit: 10,
            modelContextTokens: contextBudget.modelContextTokens,
            reservedResponseTokens: contextBudget.reservedResponseTokens,
            charsPerToken: 4,
            enableSemantic: true,
            enableReranker: true,
            enableTelemetry: true,
          })
        : { prompt: '', items: [] };

      if (retrievedContext.telemetry && import.meta.env.DEV) {
        console.debug('RAG retrieval telemetry', retrievedContext.telemetry);
      }

      const promptPack = composeTurnPrompts({
        provider: selectedProvider,
        modelId: selectedModel,
        context: {
          userName: resolvedUserName,
          dass21Results,
          sessionType: 'chat',
          timeOfDay: mentalHealthPromptService.getTimeOfDay(),
        },
        userMessage: content,
        retrievedMemoryPrompt: retrievedContext.prompt,
        extraContextSections: memory.contextPrompt ? [memory.contextPrompt] : [],
        addConversationalContinuity: true,
        recentConversation: conversationHistory,
        budget: {
          modelContextTokens: contextBudget.modelContextTokens,
          reservedResponseTokens: contextBudget.reservedResponseTokens,
          maxInputTokens: contextBudget.maxInputTokens,
        },
      });
      const finalSystemPrompt = promptPack.systemPrompt;
      const finalUserPrompt = promptPack.userPrompt;

      // Config for generation
      const config: WebLLMGenerationConfig = {
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9,
      };
      const optimizedConfig = webllmService.getOptimizedGenerationConfig(config, {
        task: 'chat',
        modelId: selectedModel,
      });

      const generateFromActiveProvider = async function* (
        promptOverride: string,
        generationConfig: WebLLMGenerationConfig,
      ): AsyncGenerator<string, void, unknown> {
        if (selectedProvider === 'native-cpu') {
          const nativePrompt = finalUserPrompt;
          const nativeSystemPrompt = promptOverride;
          let emittedAnyChunk = false;

          try {
            for await (const chunk of nativeCpuInferenceService.generateStream(nativePrompt, {
              modelId: selectedModel ?? undefined,
              modelPath: mappedNativeModelPath,
              runtimePath: mappedNativeRuntimePath,
              systemPrompt: nativeSystemPrompt,
              maxTokens: generationConfig.maxTokens,
              temperature: generationConfig.temperature,
            })) {
              emittedAnyChunk = true;
              yield chunk;
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.debug('Native CPU generation stream failed', error);
            }

            if (!emittedAnyChunk) {
              throw new Error('Native CPU generation failed before response started. Please retry.');
            }
          }

          return;
        }

        for await (const chunk of webllmService.generateResponseWithFallback(
          conversationHistory,
          generationConfig,
          promptOverride,
        )) {
          yield chunk;
        }
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
      for await (const chunk of generateFromActiveProvider(finalSystemPrompt, optimizedConfig)) {
        responseContent += chunk;
        const visibleResponse = selectedProvider === 'native-cpu'
          ? enforceMindScribeIdentity(stripNativeCliArtifacts(responseContent, content))
          : responseContent;
        
        // Update UI with streaming content
        const updatedMessages = [...currentSession.messages, {
          ...aiMessagePlaceholder,
          content: visibleResponse,
        }];
        setSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
        scrollToBottom();
      }

      if (selectedProvider === 'native-cpu') {
        responseContent = enforceMindScribeIdentity(
          stripNativeCliArtifacts(responseContent, content),
        );
      }

      const shouldRetryForQuality = isLowQualityReply(
        responseContent,
        content,
        memory.recentMessages,
      );

      if (shouldRetryForQuality) {
        if (import.meta.env.DEV) {
          console.debug('Retrying assistant response due to low-quality generic output');
        }

        responseContent = '';
        const retryPrompt = buildRecoveryPrompt(finalSystemPrompt);
        const retryConfig: WebLLMGenerationConfig = {
          ...optimizedConfig,
          temperature: Math.min(1, (optimizedConfig.temperature ?? 0.7) + 0.12),
          topP: Math.min(1, (optimizedConfig.topP ?? 0.9) + 0.05),
        };

        for await (const chunk of generateFromActiveProvider(retryPrompt, retryConfig)) {
          responseContent += chunk;
          const visibleResponse = selectedProvider === 'native-cpu'
            ? enforceMindScribeIdentity(stripNativeCliArtifacts(responseContent, content))
            : responseContent;

          const updatedMessages = [...currentSession.messages, {
            ...aiMessagePlaceholder,
            content: visibleResponse,
          }];
          setSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
          scrollToBottom();
        }
      }

      if (selectedProvider === 'native-cpu') {
        responseContent = enforceMindScribeIdentity(
          stripNativeCliArtifacts(responseContent, content),
        );
      }

      responseContent = responseContent.trim();
      if (!responseContent) {
        responseContent = 'Got you. Tell me one detail about what happened, and we will figure it out together.';
      }

      // Save the final AI message
      currentSession = await chatMemoryService.addMessage(
        currentSession,
        'assistant',
        responseContent
      );
      setSession({ ...currentSession });
      setMemoryContext(chatMemoryService.getMemoryContext(currentSession));

      if (user?.username) {
        const latestAssistantMessage = currentSession.messages[currentSession.messages.length - 1];
        await deviceMemoryService.upsertChatMessage(
          user.username,
          currentSession,
          latestAssistantMessage
        );
      }

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
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate AI response';
        toast({
          title: 'Generation failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [
    session,
    user?.username,
    selectedModel,
    resolvedUserName,
    dass21Results,
    ttsEnabled,
    toast,
    scrollToBottom,
    inferenceSelectionMode,
  ]);

  // ===========================================================================
  // SUMMARIZATION
  // ===========================================================================

  const generateSummary = useCallback(async (targetSession: ChatSession) => {
    if (!webllmService.isModelLoaded()) {
      // Use quick local summary as fallback
      const quickSummary = chatMemoryService.createQuickSummary(targetSession);
      targetSession.summary = quickSummary;
      await chatMemoryService.saveSession(targetSession);
      if (user?.username) {
        await deviceMemoryService.upsertConversationSummary(
          user.username,
          targetSession,
          quickSummary
        );
      }
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
      const config: WebLLMGenerationConfig = {
        temperature: 0.3, // Lower for more factual summary
        maxTokens: 300,
        topP: 0.9,
      };
      const optimizedConfig = webllmService.getOptimizedGenerationConfig(config, {
        task: 'summary',
        modelId: selectedModel,
      });

      let summaryResponse = '';
      for await (const chunk of webllmService.generateResponse(
        [{ role: 'user', content: summaryPrompt }],
        optimizedConfig
      )) {
        summaryResponse += chunk;
      }

      // Update session with summary
      const updatedSession = await chatMemoryService.updateSummary(
        targetSession,
        summaryResponse
      );
      if (user?.username && updatedSession.summary) {
        await deviceMemoryService.upsertConversationSummary(
          user.username,
          updatedSession,
          updatedSession.summary
        );
      }
      setSession({ ...updatedSession });
      setMemoryContext(chatMemoryService.getMemoryContext(updatedSession));

      console.log('📝 Conversation summarized:', updatedSession.summary);

    } catch (error) {
      console.error('Summary generation failed:', error);
      // Fallback to quick summary
      const quickSummary = chatMemoryService.createQuickSummary(targetSession);
      targetSession.summary = quickSummary;
      await chatMemoryService.saveSession(targetSession);
      if (user?.username) {
        await deviceMemoryService.upsertConversationSummary(
          user.username,
          targetSession,
          quickSummary
        );
      }
      setSession({ ...targetSession });
    } finally {
      setIsSummarizing(false);
    }
  }, [user?.username]);

  // ===========================================================================
  // CONTROL ACTIONS
  // ===========================================================================

  const stopGeneration = useCallback(() => {
    webllmService.stopGeneration();
    nativeCpuInferenceService.stop();
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    toast({
      title: 'Stopped',
      description: 'AI response generation stopped',
    });
  }, [toast]);

  const selectModel = useCallback(async (modelId: string) => {
    if (!webllmService.isModelCached(modelId)) {
      toast({
        title: 'Model not downloaded',
        description: 'Please download the model first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const success = await webllmService.loadModel(modelId);
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
    inferenceSelectionMode,
    setInferenceSelectionMode,
    activeInferenceProvider,
    inferenceCapabilities,

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
