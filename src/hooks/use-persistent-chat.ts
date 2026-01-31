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
import { webllmService, type WebLLMGenerationConfig } from '@/services/webllm-service';
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
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.username]);

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
    setSession({ ...currentSession });
    setMemoryContext(chatMemoryService.getMemoryContext(currentSession));
    scrollToBottom();

    // Check if model is ready
    if (!selectedModel || !webllmService.isModelLoaded()) {
      // Try to load if cached
      if (selectedModel && webllmService.isModelCached(selectedModel)) {
        try {
          await webllmService.loadModel(selectedModel);
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
      // Build conversation history with memory context
      const memory = chatMemoryService.getMemoryContext(currentSession);
      const conversationHistory: { role: string; content: string }[] = [];

      // Include summary context if available
      if (memory.contextPrompt) {
        conversationHistory.push({
          role: 'system',
          content: memory.contextPrompt,
        });
      }

      // Add recent messages
      memory.recentMessages.forEach(msg => {
        conversationHistory.push({
          role: msg.role,
          content: msg.content,
        });
      });

      // Generate personalized system prompt
      const systemPrompt = mentalHealthPromptService.generateSystemPrompt({
        userName,
        dass21Results,
        sessionType: 'chat',
        timeOfDay: mentalHealthPromptService.getTimeOfDay(),
      });

      // Check for crisis signals
      const hasCrisisSignals = mentalHealthPromptService.containsCrisisSignals(content);
      const finalSystemPrompt = hasCrisisSignals
        ? systemPrompt + mentalHealthPromptService.getCrisisResponseAddition()
        : systemPrompt;

      // Config for generation
      const config: WebLLMGenerationConfig = {
        temperature: 0.7,
        maxTokens: 512,
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
      for await (const chunk of webllmService.generateResponse(
        conversationHistory,
        config,
        finalSystemPrompt
      )) {
        responseContent += chunk;
        
        // Update UI with streaming content
        const updatedMessages = [...currentSession.messages, {
          ...aiMessagePlaceholder,
          content: responseContent,
        }];
        setSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
        scrollToBottom();
      }

      // Save the final AI message
      currentSession = await chatMemoryService.addMessage(
        currentSession,
        'assistant',
        responseContent
      );
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
    if (!webllmService.isModelLoaded()) {
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
      const config: WebLLMGenerationConfig = {
        temperature: 0.3, // Lower for more factual summary
        maxTokens: 300,
        topP: 0.9,
      };

      let summaryResponse = '';
      for await (const chunk of webllmService.generateResponse(
        [{ role: 'user', content: summaryPrompt }],
        config
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
    webllmService.stopGeneration();
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
