import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";
import { webllmService, type WebLLMGenerationConfig } from "@/services/webllm-service";
import type { ChatSession, Message, ChatMode, FocusMode } from "@/types/schema";
import { useToast } from "@/hooks/use-toast";
import { ttsService } from "@/lib/tts-service";

interface ChatMessage extends Message {
  isTyping?: boolean;
}

export function useChat(sessionId?: string) {
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);
  const [mode, setMode] = useState<ChatMode>("conversation");
  const [focus, setFocus] = useState<FocusMode>("fluency");
  const [ttsEnabled, setTtsEnabled] = useState(ttsService.getEnabled());
  const [webllmEnabled, setWebllmEnabled] = useState(true); // Enable WebLLM by default
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isWebllmGenerating, setIsWebllmGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-select first available cached model on mount and when models change
  useEffect(() => {
    const updateSelectedModel = async () => {
      try {
        const cachedModels = await webllmService.getCachedModelsAsync();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
          console.log('Auto-selected model:', cachedModels[0]);
        }
      } catch (error) {
        console.error('Error getting cached models:', error);
        // Fallback to sync method
        const cachedModels = webllmService.getCachedModels();
        if (cachedModels.length > 0 && !selectedModel) {
          setSelectedModel(cachedModels[0]);
        }
      }
    };
    
    updateSelectedModel();
    
    // Check for new models every 5 seconds
    const interval = setInterval(updateSelectedModel, 5000);
    
    return () => clearInterval(interval);
  }, [selectedModel]);

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
    onError: (_error) => {
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
      
      // Speak the AI response if TTS is enabled
      if (ttsEnabled && data.aiMessage?.content) {
        // Add a small delay to ensure the message is displayed first
        setTimeout(() => {
          ttsService.speak(data.aiMessage.content);
        }, 300);
      }
      
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
    onSuccess: (data: { aiMessage: Message }) => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/sessions", currentSessionId, "messages"] 
      });
      
      // Speak the regenerated AI response if TTS is enabled
      if (ttsEnabled && data.aiMessage?.content) {
        setTimeout(() => {
          ttsService.speak(data.aiMessage.content);
        }, 300);
      }
      
      toast({
        title: "Response Regenerated",
        description: "Generated a new response for you",
      });
    },
    onError: (_error) => {
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
    onError: (_error) => {
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

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    // Prefer WebLLM if available and enabled
    if (webllmEnabled && selectedModel) {
      // Auto-load the model if it's cached but not loaded
      if (webllmService.isModelCached(selectedModel) && !webllmService.isModelLoaded()) {
        try {
          await webllmService.loadModel(selectedModel);
        } catch (error) {
          console.error('Failed to load model:', error);
        }
      }
      
      // Use WebLLM if model is loaded
      if (webllmService.isModelLoaded()) {
        await sendWebLLMMessage(content);
        return;
      }
    }
    
    // Fallback to regular backend
    if (!currentSessionId) {
      createSessionMutation.mutate(
        { title: content.slice(0, 50), mode, focus },
        {
          onSuccess: (_newSession) => {
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
  }, [currentSessionId, mode, focus, createSessionMutation, sendMessageMutation, webllmEnabled, selectedModel]);

  const sendWebLLMMessage = useCallback(async (content: string) => {
    if (!selectedModel || !webllmService.isModelLoaded()) {
      toast({
        title: "Model Not Ready",
        description: "Please wait for the model to load or select a different model",
        variant: "destructive"
      });
      return;
    }

    setIsWebllmGenerating(true);

    try {
      // Create user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date(),
        sessionId: currentSessionId || "webllm-session",
        grammarSuggestions: null,
        feedback: null
      };

      // Add user message to local state
      queryClient.setQueryData(
        ["/api/chat/sessions", currentSessionId, "messages"],
        (oldMessages: Message[] = []) => [...oldMessages, userMessage]
      );

      // Prepare conversation history for WebLLM
      const currentMessages = queryClient.getQueryData<Message[]>(["/api/chat/sessions", currentSessionId, "messages"]) || [];
      const conversationHistory = currentMessages.map(msg => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      }));

      // Generate AI response
      const aiMessageId = `ai-${Date.now()}`;
      let responseContent = "";

      // Add initial typing indicator
      const initialAiMessage: Message = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
        sessionId: currentSessionId || "webllm-session",
        grammarSuggestions: null,
        feedback: null,
        isTyping: true
      } as Message & { isTyping: boolean };

      queryClient.setQueryData(
        ["/api/chat/sessions", currentSessionId, "messages"],
        (oldMessages: Message[] = []) => [...oldMessages, initialAiMessage]
      );

      const config: WebLLMGenerationConfig = {
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9
      };

      // Stream the response
      for await (const chunk of webllmService.generateResponse(conversationHistory, config)) {
        responseContent += chunk;
        
        // Update the message content in real-time
        queryClient.setQueryData(
          ["/api/chat/sessions", currentSessionId, "messages"],
          (oldMessages: Message[] = []) => 
            oldMessages.map(msg => 
              msg.id === aiMessageId 
                ? { ...msg, content: responseContent, isTyping: true }
                : msg
            )
        );
      }

      // Final update - remove typing indicator
      queryClient.setQueryData(
        ["/api/chat/sessions", currentSessionId, "messages"],
        (oldMessages: Message[] = []) => 
          oldMessages.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: responseContent, isTyping: false }
              : msg
          )
      );

      // Speak the response if TTS is enabled
      if (ttsEnabled && responseContent) {
        setTimeout(() => {
          ttsService.speak(responseContent);
        }, 300);
      }

      scrollToBottom();

    } catch (error) {
      console.error('WebLLM generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate response",
        variant: "destructive"
      });
    } finally {
      setIsWebllmGenerating(false);
    }
  }, [selectedModel, currentSessionId, queryClient, ttsEnabled, toast, scrollToBottom]);

  const stopWebLLMGeneration = useCallback(() => {
    webllmService.stopGeneration();
    setIsWebllmGenerating(false);
    
    toast({
      title: "Generation Stopped",
      description: "AI response generation has been stopped"
    });
  }, [toast]);

  const toggleWebLLM = useCallback((enabled: boolean) => {
    setWebllmEnabled(enabled);
    if (!enabled) {
      setSelectedModel(null);
    }
  }, []);

  const selectWebLLMModel = useCallback(async (modelId: string) => {
    if (!webllmService.isModelCached(modelId)) {
      toast({
        title: "Model Not Downloaded",
        description: "Please download the model first in settings",
        variant: "destructive"
      });
      return;
    }

    try {
      const success = await webllmService.loadModel(modelId);
      if (success) {
        setSelectedModel(modelId);
        toast({
          title: "Model Loaded",
          description: `${modelId} is now active`
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Load Model",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  }, [toast]);

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

  const toggleTTS = useCallback((enabled: boolean) => {
    setTtsEnabled(enabled);
    ttsService.setEnabled(enabled);
  }, []);

  const speakMessage = useCallback((text: string) => {
    ttsService.speak(text);
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const exportSession = useCallback(async (format: 'txt' | 'md' | 'json') => {
    if (!currentSessionId) return;
    
    try {
      const url = getApiUrl(`/api/chat/sessions/${currentSessionId}/export/${format}`);
      const response = await fetch(url, {
        credentials: "include",
        mode: "cors",
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `chat.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
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
    ttsEnabled,
    
    // WebLLM data
    webllmEnabled,
    selectedModel,
    isWebllmGenerating,
    
    // Loading states
    sessionLoading,
    messagesLoading,
    isSending: sendMessageMutation.isPending || isWebllmGenerating,
    isRegenerating: regenerateMessageMutation.isPending,
    
    // Actions
    createNewSession,
    sendMessage,
    regenerateMessage,
    updateMode,
    updateFocus,
    switchSession,
    exportSession,
    toggleTTS,
    speakMessage,
    
    // WebLLM actions
    toggleWebLLM,
    selectWebLLMModel,
    stopWebLLMGeneration,
    
    // Refs
    messagesEndRef,
  };
}
