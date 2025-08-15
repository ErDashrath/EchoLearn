import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatArea } from "@/components/chat/ChatArea";
import { InputArea } from "@/components/chat/InputArea";
import { Sidebar } from "@/components/navigation/Sidebar";
import { HamburgerMenu } from "@/components/navigation/HamburgerMenu";
import { ModelSelector } from "@/components/navigation/ModelSelector";
import { SystemPromptManager } from "@/components/chat/SystemPromptManager";
import { useChat } from "@/hooks/use-chat";
import { useTheme } from "@/components/ui/theme-provider";
import { Bot, Moon, Sun, Volume2, VolumeX, Settings } from "lucide-react";
import type { ChatMode, FocusMode } from "@/types/schema";

export default function ChatPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const { theme, toggleTheme } = useTheme();
  
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
  } = useChat();

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
            <span className="font-semibold text-lg">EchoLearn</span>
            <span className="text-sm text-gray-400 bg-gray-800 px-2 py-1 rounded">AI Tutor</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Model Selector */}
          <ModelSelector
            selectedModel={selectedModel || "llama-3.2-3b"}
            onModelSelect={selectWebLLMModel}
            isLoading={isWebllmGenerating}
            onOpenSidebar={toggleSidebar}
          />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className={`h-10 w-10 rounded-lg hover:bg-gray-800 ${
              showSystemPrompt ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400'
            }`}
          >
            <Settings className="h-4 w-4" />
          </Button>
          
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
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-10 w-10 rounded-lg hover:bg-gray-800 text-gray-400"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* System Prompt Modal */}
      <AnimatePresence>
        {showSystemPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowSystemPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <SystemPromptManager
                onPromptChange={(prompt, isEnabled) => {
                  console.log("System prompt updated:", { prompt, isEnabled });
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                Hello, Dashrath
              </h1>
              <p className="text-gray-400 text-lg">
                Ready to practice English with your AI tutor?
              </p>
            </motion.div>

            {/* Input Area */}
            <div className="w-full max-w-3xl">
              <div className="relative">
                <InputArea
                  onSendMessage={sendMessage}
                  disabled={isSending || messagesLoading}
                  placeholder="Ask your English tutor anything..."
                  isWelcomeScreen={true}
                />
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 justify-center">
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("Help me practice conversation")}
                >
                  Practice Conversation
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("Check my grammar")}
                >
                  Grammar Check
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("Start an interview practice")}
                >
                  Interview Practice
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("Help me with pronunciation")}
                >
                  Pronunciation Help
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
                disabled={isSending || messagesLoading}
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
      />
    </div>
  );
}
