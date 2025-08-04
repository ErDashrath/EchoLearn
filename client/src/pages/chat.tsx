import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatArea } from "@/components/chat/ChatArea";
import { InputArea } from "@/components/chat/InputArea";
import { SettingsPanel } from "@/components/chat/SettingsPanel";
import { useChat } from "@/hooks/use-chat";
import { useTheme } from "@/components/ui/theme-provider";
import { Bot, Settings, Moon, Sun } from "lucide-react";
import type { ChatMode, FocusMode } from "@shared/schema";

const MODE_OPTIONS: { value: ChatMode; label: string }[] = [
  { value: "conversation", label: "Conversation" },
  { value: "interview", label: "Interview" },
  { value: "roleplay", label: "Roleplay" },
];

const FOCUS_OPTIONS: { value: FocusMode; label: string }[] = [
  { value: "fluency", label: "Fluency" },
  { value: "correction", label: "Correction" },
];

export default function ChatPage() {
  const [showSettings, setShowSettings] = useState(false);
  const { theme, toggleTheme } = useTheme();
  
  const {
    messages,
    mode,
    focus,
    messagesLoading,
    isSending,
    isRegenerating,
    sendMessage,
    regenerateMessage,
    updateMode,
    updateFocus,
    exportSession,
  } = useChat();

  const handleModeChange = (newMode: ChatMode) => {
    updateMode(newMode);
  };

  const handleFocusChange = (newFocus: FocusMode) => {
    updateFocus(newFocus);
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-card/80 backdrop-blur-xl border-b border-white/20 dark:border-border/20">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              AI English Tutor
            </h1>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl hover-lift"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              className="h-10 w-10 rounded-xl hover-lift"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mode Selector */}
      <div className="bg-white/60 dark:bg-card/60 backdrop-blur-xl border-b border-white/20 dark:border-border/20">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <span className="text-sm font-medium text-muted-foreground">Mode:</span>
              <div className="flex bg-white/80 dark:bg-muted/80 rounded-2xl p-1 shadow-sm backdrop-blur-sm">
                {MODE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={mode === option.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleModeChange(option.value)}
                    className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                      mode === option.value ? 'button-gradient text-white shadow-lg' : 'hover:bg-white/60'
                    }`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <span className="text-sm text-muted-foreground">Focus:</span>
              <div className="flex bg-white/80 dark:bg-muted/80 rounded-xl p-1 shadow-sm backdrop-blur-sm">
                {FOCUS_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={focus === option.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleFocusChange(option.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      focus === option.value ? 'button-gradient text-white shadow-md' : 'hover:bg-white/60'
                    }`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <ChatArea
        messages={messages}
        isLoading={isSending}
        onRegenerateMessage={regenerateMessage}
        isRegenerating={isRegenerating}
      />

      {/* Input Area */}
      <InputArea
        onSendMessage={sendMessage}
        disabled={isSending || messagesLoading}
        placeholder="Type your message or press the mic button to speak..."
        onSystemPromptChange={(prompt, isEnabled) => {
          console.log("System prompt updated:", { prompt, isEnabled });
          // TODO: Implement system prompt functionality in chat hook
        }}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        mode={mode}
        focus={focus}
        onModeChange={handleModeChange}
        onFocusChange={handleFocusChange}
        onExportChat={exportSession}
        stats={calculateStats()}
      />
    </div>
  );
}
