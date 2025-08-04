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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold">AI English Tutor</h1>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9"
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
              className="h-9 w-9"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mode Selector */}
      <div className="px-4 py-3 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-muted-foreground">Mode:</span>
            <div className="flex bg-muted rounded-xl p-1">
              {MODE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={mode === option.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleModeChange(option.value)}
                  className="px-4 py-2 text-sm font-medium rounded-lg"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Focus:</span>
            <div className="flex bg-muted rounded-lg p-1">
              {FOCUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={focus === option.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleFocusChange(option.value)}
                  className="px-3 py-1 text-xs font-medium rounded-md"
                >
                  {option.label}
                </Button>
              ))}
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
