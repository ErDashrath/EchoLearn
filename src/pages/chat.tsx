import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatArea } from "@/components/chat/ChatArea";
import { InputArea } from "@/components/chat/InputArea";
import { Sidebar } from "@/components/navigation/Sidebar";
import { HamburgerMenu } from "@/components/navigation/HamburgerMenu";
import { ModelSelector } from "@/components/navigation/ModelSelector";
import { ModelDownloadPanel } from "@/components/chat/ModelDownloadPanel";
import { useChat } from "@/hooks/use-chat";
import { useChatSession } from "@/hooks/use-chat-session";
import { useAuth } from "@/contexts/AuthContext";
import { Bot, Volume2, VolumeX, Brain } from "lucide-react";
import {
  inferenceRuntimeService,
  type InferenceProviderId,
  type InferenceSelectionMode,
  type InferenceRuntimeCapabilities,
} from "@/services/inference-runtime-service";
import type { ChatMode, FocusMode } from "@/types/schema";
import type { DASS21Results } from "@/services/mental-health-prompt-service";

export default function ChatPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [dass21Results, setDass21Results] = useState<DASS21Results | null>(null);
  const [inferenceSelectionMode, setInferenceSelectionMode] =
    useState<InferenceSelectionMode>(() => inferenceRuntimeService.getSelectionMode());
  const [activeInferenceProvider, setActiveInferenceProvider] = useState<InferenceProviderId | null>(null);
  const [inferenceCapabilities, setInferenceCapabilities] =
    useState<InferenceRuntimeCapabilities | null>(null);
  // System prompt state
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [isCustomPromptEnabled, setIsCustomPromptEnabled] = useState(false);
  
  const { user, getDASS21Results, hasCompletedDASS21 } = useAuth();
  
  // Chat session hook for history management
  const {
    session,
    sessions,
    isLoading: sessionsLoading,
    createNewSession,
    loadSession,
    deleteSession,
  } = useChatSession({ autoLoad: true });
  
  // F009: Load DASS-21 results for personalized AI
  useEffect(() => {
    const loadDASS21 = async () => {
      if (hasCompletedDASS21) {
        const results = await getDASS21Results();
        setDass21Results(results);
      }
    };
    loadDASS21();
  }, [hasCompletedDASS21, getDASS21Results]);

  useEffect(() => {
    let mounted = true;

    const refreshCapabilities = async () => {
      try {
        const capabilities = await inferenceRuntimeService.getCapabilities();
        if (!mounted) {
          return;
        }
        const provider = inferenceRuntimeService.resolveProvider(capabilities, inferenceSelectionMode);
        setInferenceCapabilities(capabilities);
        setActiveInferenceProvider(provider);
      } catch {
        if (mounted) {
          setInferenceCapabilities(null);
          setActiveInferenceProvider(null);
        }
      }
    };

    refreshCapabilities();
    const interval = setInterval(refreshCapabilities, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [inferenceSelectionMode]);
  
  const {
    messages,
    mode,
    focus,
    ttsEnabled,
    messagesLoading,
    isSending,
    isRegenerating,
    selectedModel,
    isWebllmGenerating,
    sendMessage,
    regenerateMessage,
    updateMode,
    updateFocus,
    toggleTTS,
    selectWebLLMModel,
    stopWebLLMGeneration,
    exportSession,
  } = useChat(undefined, {
    userName: user?.username || user?.name,
    dass21Results
  });

  const handleModeChange = (newMode: ChatMode) => {
    updateMode(newMode);
  };

  const handleFocusChange = (newFocus: FocusMode) => {
    updateFocus(newFocus);
  };

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const closeSidebar = () => {
    setShowSidebar(false);
  };

  const toggleModelPanel = () => {
    setShowModelPanel(!showModelPanel);
  };

  const closeModelPanel = () => {
    setShowModelPanel(false);
  };

  const calculateStats = () => {
    const messagesSent = messages.filter(m => m.role === "user").length;
    const grammarImprovements = messages.reduce((acc, m) => 
      acc + (m.grammarSuggestions?.length || 0), 0
    );
    
    return {
      messagesSent,
      grammarImprovements,
      speakingTime: "12 min", // This would be calculated from actual speech time
    };
  };

  // Chat History handlers
  const handleNewSession = async () => {
    await createNewSession();
  };

  const handleSelectSession = async (sessionId: string) => {
    await loadSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (confirm('Delete this conversation?')) {
      await deleteSession(sessionId);
    }
  };

  // System Prompt handler
  const handleSystemPromptChange = (prompt: string, isEnabled: boolean) => {
    setCustomSystemPrompt(prompt);
    setIsCustomPromptEnabled(isEnabled);
    console.log("System prompt updated:", { prompt, isEnabled });
  };
  // F009: Get personalized greeting
  const getPersonalizedGreeting = () => {
    const name = user?.username || user?.name || '';
    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour >= 5 && hour < 12) greeting = 'Good morning';
    else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17 && hour < 21) greeting = 'Good evening';
    
    return name ? `${greeting}, ${name}` : greeting;
  };

  const handleInferenceModeChange = (mode: InferenceSelectionMode) => {
    inferenceRuntimeService.setSelectionMode(mode);
    setInferenceSelectionMode(mode);

    if (inferenceCapabilities) {
      setActiveInferenceProvider(inferenceRuntimeService.resolveProvider(inferenceCapabilities, mode));
    }
  };

  const providerLabel = activeInferenceProvider === 'native-cpu'
    ? 'Native CPU'
    : activeInferenceProvider === 'webllm-webgpu'
      ? 'WebGPU'
      : 'Unavailable';

  const inferenceBlocked = !!inferenceCapabilities && !activeInferenceProvider;
  const capabilityReason = inferenceBlocked
    ? inferenceSelectionMode === 'webllm-webgpu'
      ? inferenceCapabilities?.webgpu.reason || 'WebGPU provider is unavailable.'
      : inferenceSelectionMode === 'native-cpu'
        ? inferenceCapabilities?.nativeCpu.reason || 'Native CPU provider is unavailable.'
        : [inferenceCapabilities?.webgpu.reason, inferenceCapabilities?.nativeCpu.reason]
            .filter((value): value is string => !!value)
            .join(' ')
    : '';

  const nativeStatus = inferenceCapabilities?.nativeCpuStatus;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header with Hamburger Menu */}
      <header className={`flex items-center justify-between p-4 border-b border-gray-800 transition-all duration-300 ${showSidebar ? 'ml-80' : ''}`}>
        <div className="flex items-center space-x-4">
          <HamburgerMenu onClick={toggleSidebar} isOpen={showSidebar} />
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-lg">MindScribe</span>
            {/* F009: Show personalization badge when DASS-21 is active */}
            {dass21Results ? (
              <span className="text-xs text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded flex items-center gap-1">
                <Brain className="h-3 w-3" />
                Personalized
              </span>
            ) : (
              <span className="text-sm text-gray-400 bg-gray-800 px-2 py-1 rounded">Your Therapist</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center rounded-lg border border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => handleInferenceModeChange('auto')}
              className={`px-2 py-1 text-xs ${
                inferenceSelectionMode === 'auto'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => handleInferenceModeChange('webllm-webgpu')}
              className={`px-2 py-1 text-xs border-l border-gray-700 ${
                inferenceSelectionMode === 'webllm-webgpu'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              WebGPU
            </button>
            <button
              type="button"
              onClick={() => handleInferenceModeChange('native-cpu')}
              className={`px-2 py-1 text-xs border-l border-gray-700 ${
                inferenceSelectionMode === 'native-cpu'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Native CPU
            </button>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              activeInferenceProvider
                ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-200 bg-amber-500/10'
            }`}
          >
            Inference: {providerLabel} ({inferenceSelectionMode})
          </span>
          {/* Model Download Button - Opens Right Panel */}
          <Button
            variant="ghost"
            onClick={toggleModelPanel}
            className="flex items-center space-x-2 h-10 px-4 rounded-lg bg-gradient-to-r from-purple-600/30 to-blue-600/30 hover:from-purple-600/40 hover:to-blue-600/40 text-purple-300 hover:text-white border border-purple-500/40 transition-all"
            title="Download AI Models"
          >
            <Brain className="h-4 w-4" />
            <span className="text-sm font-medium">Download Model</span>
          </Button>
          
          {/* Model Selector - Shows current model */}
          <ModelSelector
            selectedModel={selectedModel || "llama-3.2-3b"}
            onModelSelect={selectWebLLMModel}
            isLoading={isWebllmGenerating}
            onOpenSidebar={toggleModelPanel}
          />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleTTS(!ttsEnabled)}
            className={`h-10 w-10 rounded-lg hover:bg-gray-800 ${
              ttsEnabled ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400'
            }`}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {inferenceBlocked && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-medium">No local inference provider is available on this device.</div>
            <div className="mt-1 text-amber-100/90">{capabilityReason || 'Check WebGPU support or native CPU setup.'}</div>
            {nativeStatus && (
              <div className="mt-2 text-xs text-amber-100/80 space-y-1">
                <div>Native profile: {nativeStatus.profile || 'N/A'}</div>
                <div>Effective threads: {nativeStatus.effectiveThreads ?? 'N/A'}</div>
                <div>Token cap: {nativeStatus.maxTokensCap ?? 'N/A'}</div>
                <div>Native runtime: {nativeStatus.runtime || 'Not found'}</div>
                <div>Native model: {nativeStatus.model || 'Not found'}</div>
                <div>Runtime SHA-256: {nativeStatus.runtimeSha256 || 'Unavailable'}</div>
                <div>Model SHA-256: {nativeStatus.modelSha256 || 'Unavailable'}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${showSidebar ? 'ml-80' : ''}`}>
        {messages.length === 0 ? (
          /* Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-3xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <h1 className="text-4xl font-normal mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {getPersonalizedGreeting()}
              </h1>
              <p className="text-gray-400 text-lg">
                {dass21Results 
                  ? "I'm here with personalized support based on your assessment. How are you feeling today?"
                  : "How are you feeling today? I'm here to listen, understand, and support you through anything."}
              </p>
              {/* F009: Show severity indicators if elevated */}
              {dass21Results && (
                <div className="flex justify-center gap-2 mt-4">
                  {dass21Results.severityLevels.depression.level !== 'Normal' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-900/30 text-blue-400">
                      Depression Support Active
                    </span>
                  )}
                  {dass21Results.severityLevels.anxiety.level !== 'Normal' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-900/30 text-amber-400">
                      Anxiety Support Active
                    </span>
                  )}
                  {dass21Results.severityLevels.stress.level !== 'Normal' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-rose-900/30 text-rose-400">
                      Stress Support Active
                    </span>
                  )}
                </div>
              )}
            </motion.div>

            {/* Input Area */}
            <div className="w-full max-w-3xl">
              <div className="relative">
                <InputArea
                  onSendMessage={sendMessage}
                  disabled={isSending || messagesLoading || inferenceBlocked}
                  placeholder="Share what's on your mind... I'm here to listen."
                  isWelcomeScreen={true}
                />
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 justify-center">
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  disabled={inferenceBlocked}
                  onClick={() => sendMessage("I'm feeling anxious and need someone to talk to")}
                >
                  Feeling Anxious
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  disabled={inferenceBlocked}
                  onClick={() => sendMessage("I'm dealing with stress and need coping strategies")}
                >
                  Managing Stress
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  disabled={inferenceBlocked}
                  onClick={() => sendMessage("I need help processing my emotions today")}
                >
                  Process Emotions
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  disabled={inferenceBlocked}
                  onClick={() => sendMessage("I want to talk about my relationships and get advice")}
                >
                  Relationship Support
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Chat Area */
          <div className="flex-1 flex flex-col">
            <ChatArea
              messages={messages}
              isLoading={isSending}
              onRegenerateMessage={regenerateMessage}
              isRegenerating={isRegenerating}
              isWebllmGenerating={isWebllmGenerating}
              onStopGeneration={stopWebLLMGeneration}
            />
            <div className="p-4 max-w-2xl mx-auto w-full">
              <InputArea
                onSendMessage={sendMessage}
                disabled={isSending || messagesLoading || inferenceBlocked}
                placeholder="Continue the conversation..."
                isWelcomeScreen={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        isOpen={showSidebar}
        onClose={closeSidebar}
        mode={mode}
        focus={focus}
        onModeChange={handleModeChange}
        onFocusChange={handleFocusChange}
        onExportChat={exportSession}
        ttsEnabled={ttsEnabled}
        onTTSToggle={toggleTTS}
        selectedModel={selectedModel || undefined}
        onModelSelect={selectWebLLMModel}
        stats={calculateStats()}
        // Chat History props
        sessions={sessions}
        currentSessionId={session?.id || null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        sessionsLoading={sessionsLoading}
        // System Prompt props
        customSystemPrompt={customSystemPrompt}
        isCustomPromptEnabled={isCustomPromptEnabled}
        onSystemPromptChange={handleSystemPromptChange}
      />

      {/* Model Download Panel (Right Side) */}
      <ModelDownloadPanel
        isOpen={showModelPanel}
        onClose={closeModelPanel}
        selectedModel={selectedModel || undefined}
        onModelSelect={selectWebLLMModel}
      />
    </div>
  );
}
