/**
 * F010: Chat Session Hook
 * 
 * React hook for managing chat sessions with smart memory.
 * Integrates chat-memory-service with the UI.
 * 
 * Features:
 * - Session persistence
 * - Auto-summarization
 * - Memory context injection
 * - Session history management
 * 
 * @module hooks/use-chat-session
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  chatMemoryService,
  ChatSession,
  MemoryContext,
  MemoryConfig,
} from '@/services/chat-memory-service';

// =============================================================================
// TYPES
// =============================================================================

export interface UseChatSessionOptions {
  /** Auto-load most recent session on mount */
  autoLoad?: boolean;
  /** Memory configuration overrides */
  memoryConfig?: Partial<MemoryConfig>;
  /** Callback when summary needs to be generated */
  onSummaryNeeded?: (prompt: string) => Promise<string>;
}

export interface UseChatSessionReturn {
  // Session state
  session: ChatSession | null;
  sessions: ChatSession[];
  isLoading: boolean;
  error: string | null;

  // Memory context
  memoryContext: MemoryContext | null;
  needsSummaryUpdate: boolean;

  // Session actions
  createNewSession: (title?: string) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  loadAllSessions: () => Promise<void>;

  // Message actions
  addUserMessage: (content: string) => Promise<void>;
  addAssistantMessage: (content: string) => Promise<void>;

  // Memory actions
  updateSummary: (summaryResponse: string) => Promise<void>;
  generateQuickSummary: () => void;
  getSummaryPrompt: () => string | null;

  // Utilities
  getFormattedMessages: () => { role: string; content: string }[];
  clearError: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useChatSession(options: UseChatSessionOptions = {}): UseChatSessionReturn {
  const { autoLoad = true, memoryConfig, onSummaryNeeded } = options;
  const { user } = useAuth();

  // State
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryContext, setMemoryContext] = useState<MemoryContext | null>(null);

  // Refs
  const summaryPendingRef = useRef(false);

  // Apply memory config
  useEffect(() => {
    if (memoryConfig) {
      chatMemoryService.setConfig(memoryConfig);
    }
  }, [memoryConfig]);

  // ===========================================================================
  // SESSION LOADING
  // ===========================================================================

  const loadAllSessions = useCallback(async () => {
    if (!user?.username) return;

    setIsLoading(true);
    try {
      const userSessions = await chatMemoryService.getUserSessions(user.username);
      setSessions(userSessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load chat history');
    } finally {
      setIsLoading(false);
    }
  }, [user?.username]);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedSession = await chatMemoryService.getSession(sessionId);
      if (loadedSession) {
        setSession(loadedSession);
        setMemoryContext(chatMemoryService.getMemoryContext(loadedSession));
      } else {
        setError('Session not found');
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && user?.username) {
      loadAllSessions().then(() => {
        // Optionally load most recent session
      });
    }
  }, [autoLoad, user?.username, loadAllSessions]);

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  const createNewSession = useCallback(async (title?: string): Promise<ChatSession | null> => {
    if (!user?.username) {
      setError('Must be logged in to create a session');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newSession = await chatMemoryService.createSession(user.username, title);
      setSession(newSession);
      setMemoryContext(chatMemoryService.getMemoryContext(newSession));
      setSessions(prev => [newSession, ...prev]);
      return newSession;
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create new chat');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.username]);

  const deleteSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await chatMemoryService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (session?.id === sessionId) {
        setSession(null);
        setMemoryContext(null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError('Failed to delete chat');
    } finally {
      setIsLoading(false);
    }
  }, [session?.id]);

  // ===========================================================================
  // MESSAGE MANAGEMENT
  // ===========================================================================

  const addUserMessage = useCallback(async (content: string) => {
    let currentSession = session;

    // Create new session if needed
    if (!currentSession) {
      currentSession = await createNewSession();
      if (!currentSession) return;
    }

    try {
      const updatedSession = await chatMemoryService.addMessage(
        currentSession,
        'user',
        content
      );
      setSession(updatedSession);
      setMemoryContext(chatMemoryService.getMemoryContext(updatedSession));

      // Update sessions list
      setSessions(prev => {
        const index = prev.findIndex(s => s.id === updatedSession.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = updatedSession;
          return updated;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to add user message:', err);
      setError('Failed to save message');
    }
  }, [session, createNewSession]);

  const addAssistantMessage = useCallback(async (content: string) => {
    if (!session) return;

    try {
      const updatedSession = await chatMemoryService.addMessage(
        session,
        'assistant',
        content
      );
      setSession(updatedSession);
      setMemoryContext(chatMemoryService.getMemoryContext(updatedSession));

      // Check if summary update is needed
      if (chatMemoryService.needsSummaryUpdate(updatedSession) && !summaryPendingRef.current) {
        summaryPendingRef.current = true;
        
        // If callback provided, generate summary with LLM
        if (onSummaryNeeded) {
          const prompt = chatMemoryService.generateSummaryPrompt(updatedSession);
          if (prompt) {
            try {
              const summaryResponse = await onSummaryNeeded(prompt);
              const finalSession = await chatMemoryService.updateSummary(
                updatedSession,
                summaryResponse
              );
              setSession(finalSession);
              setMemoryContext(chatMemoryService.getMemoryContext(finalSession));
            } catch (err) {
              console.warn('LLM summary failed, using quick summary');
              generateQuickSummaryInternal(updatedSession);
            }
          }
        } else {
          // Use quick local summary as fallback
          generateQuickSummaryInternal(updatedSession);
        }
        
        summaryPendingRef.current = false;
      }

      // Update sessions list
      setSessions(prev => {
        const index = prev.findIndex(s => s.id === updatedSession.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = updatedSession;
          return updated;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to add assistant message:', err);
      setError('Failed to save response');
    }
  }, [session, onSummaryNeeded]);

  // ===========================================================================
  // MEMORY MANAGEMENT
  // ===========================================================================

  const generateQuickSummaryInternal = useCallback((targetSession: ChatSession) => {
    const summary = chatMemoryService.createQuickSummary(targetSession);
    targetSession.summary = summary;
    chatMemoryService.saveSession(targetSession);
    setSession({ ...targetSession });
    setMemoryContext(chatMemoryService.getMemoryContext(targetSession));
  }, []);

  const generateQuickSummary = useCallback(() => {
    if (session) {
      generateQuickSummaryInternal(session);
    }
  }, [session, generateQuickSummaryInternal]);

  const updateSummary = useCallback(async (summaryResponse: string) => {
    if (!session) return;

    const updatedSession = await chatMemoryService.updateSummary(session, summaryResponse);
    setSession(updatedSession);
    setMemoryContext(chatMemoryService.getMemoryContext(updatedSession));
  }, [session]);

  const getSummaryPrompt = useCallback((): string | null => {
    if (!session) return null;
    return chatMemoryService.generateSummaryPrompt(session);
  }, [session]);

  const needsSummaryUpdate = session ? chatMemoryService.needsSummaryUpdate(session) : false;

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  const getFormattedMessages = useCallback((): { role: string; content: string }[] => {
    if (!memoryContext) return [];

    const messages: { role: string; content: string }[] = [];

    // Add summary context as system message if available
    if (memoryContext.contextPrompt) {
      messages.push({
        role: 'system',
        content: memoryContext.contextPrompt,
      });
    }

    // Add recent messages
    memoryContext.recentMessages.forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    return messages;
  }, [memoryContext]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ===========================================================================
  // RETURN
  // ===========================================================================

  return {
    // Session state
    session,
    sessions,
    isLoading,
    error,

    // Memory context
    memoryContext,
    needsSummaryUpdate,

    // Session actions
    createNewSession,
    loadSession,
    deleteSession,
    loadAllSessions,

    // Message actions
    addUserMessage,
    addAssistantMessage,

    // Memory actions
    updateSummary,
    generateQuickSummary,
    getSummaryPrompt,

    // Utilities
    getFormattedMessages,
    clearError,
  };
}

export default useChatSession;
