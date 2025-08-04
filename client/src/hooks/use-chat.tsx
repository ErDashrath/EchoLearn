import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChatSession, Message, ChatMode, FocusMode } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage extends Message {
  isTyping?: boolean;
}

export function useChat(sessionId?: string) {
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);
  const [mode, setMode] = useState<ChatMode>("conversation");
  const [focus, setFocus] = useState<FocusMode>("fluency");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch current session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/chat/sessions", currentSessionId],
    enabled: !!currentSessionId,
  });

  // Fetch messages for current session
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/chat/sessions", currentSessionId, "messages"],
    enabled: !!currentSessionId,
  });

  // Fetch user sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/chat/sessions"],
  });

  // Create new session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (data: { title: string; mode: ChatMode; focus: FocusMode }) => {
      const response = await apiRequest("POST", "/api/chat/sessions", data);
      return response.json();
    },
    onSuccess: (newSession: ChatSession) => {
      setCurrentSessionId(newSession.id);
      setMode(newSession.mode as ChatMode);
      setFocus(newSession.focus as FocusMode);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      toast({
        title: "New Chat Started",
        description: "Ready to help you learn English!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create new chat session",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentSessionId) throw new Error("No active session");
      
      const response = await apiRequest(
        "POST", 
        `/api/chat/sessions/${currentSessionId}/messages`,
        { content, role: "user" }
      );
      return response.json();
    },
    onSuccess: (data: { userMessage: Message; aiMessage: Message }) => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/sessions", currentSessionId, "messages"] 
      });
      scrollToBottom();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Regenerate message mutation
  const regenerateMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/chat/messages/${messageId}/regenerate`,
        { sessionId: currentSessionId }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/sessions", currentSessionId, "messages"] 
      });
      toast({
        title: "Response Regenerated",
        description: "Generated a new response for you",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to regenerate response",
        variant: "destructive",
      });
    },
  });

  // Update session mode/focus
  const updateSessionMutation = useMutation({
    mutationFn: async (updates: { mode?: ChatMode; focus?: FocusMode }) => {
      if (!currentSessionId) throw new Error("No active session");
      
      const response = await apiRequest(
        "PATCH",
        `/api/chat/sessions/${currentSessionId}`,
        updates
      );
      return response.json();
    },
    onSuccess: (updatedSession: ChatSession) => {
      setMode(updatedSession.mode as ChatMode);
      setFocus(updatedSession.focus as FocusMode);
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/sessions", currentSessionId] 
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update session settings",
        variant: "destructive",
      });
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const createNewSession = useCallback((title: string = "New Chat") => {
    createSessionMutation.mutate({ title, mode, focus });
  }, [mode, focus, createSessionMutation]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;
    
    if (!currentSessionId) {
      createSessionMutation.mutate(
        { title: content.slice(0, 50), mode, focus },
        {
          onSuccess: (newSession) => {
            // After session is created, send the message
            setTimeout(() => {
              sendMessageMutation.mutate(content);
            }, 100);
          }
        }
      );
    } else {
      sendMessageMutation.mutate(content);
    }
  }, [currentSessionId, mode, focus, createSessionMutation, sendMessageMutation]);

  const regenerateMessage = useCallback((messageId: string) => {
    regenerateMessageMutation.mutate(messageId);
  }, [regenerateMessageMutation]);

  const updateMode = useCallback((newMode: ChatMode) => {
    setMode(newMode);
    if (currentSessionId) {
      updateSessionMutation.mutate({ mode: newMode });
    }
  }, [currentSessionId, updateSessionMutation]);

  const updateFocus = useCallback((newFocus: FocusMode) => {
    setFocus(newFocus);
    if (currentSessionId) {
      updateSessionMutation.mutate({ focus: newFocus });
    }
  }, [currentSessionId, updateSessionMutation]);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const exportSession = useCallback(async (format: 'txt' | 'md' | 'json') => {
    if (!currentSessionId) return;
    
    try {
      const response = await fetch(`/api/chat/sessions/${currentSessionId}/export/${format}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `chat.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: `Chat exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export chat session",
        variant: "destructive",
      });
    }
  }, [currentSessionId, toast]);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return {
    // Session data
    session,
    messages: messages as ChatMessage[],
    sessions,
    currentSessionId,
    mode,
    focus,
    
    // Loading states
    sessionLoading,
    messagesLoading,
    isSending: sendMessageMutation.isPending,
    isRegenerating: regenerateMessageMutation.isPending,
    
    // Actions
    createNewSession,
    sendMessage,
    regenerateMessage,
    updateMode,
    updateFocus,
    switchSession,
    exportSession,
    
    // Refs
    messagesEndRef,
  };
}
