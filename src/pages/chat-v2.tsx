/**
 * F010: Chat Page with Persistent Memory
 * 
 * Main chat interface with:
 * - Persistent chat history
 * - Smart memory summarization
 * - Session management sidebar
 * - DASS-21 personalization
 * 
 * @module pages/chat
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatArea } from "@/components/chat/ChatArea";
import { InputArea } from "@/components/chat/InputArea";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { ModelSelector } from "@/components/navigation/ModelSelector";
import { usePersistentChat } from "@/hooks/use-persistent-chat";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/ui/theme-provider";
import {
  Bot,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  History,
  Brain,
  Sparkles,
  Plus,
} from "lucide-react";
import type { DASS21Results } from "@/services/mental-health-prompt-service";
import type { Message } from "@/types/schema";

export default function ChatPage() {
  const [showHistory, setShowHistory] = useState(false);
  const [dass21Results, setDass21Results] = useState<DASS21Results | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, getDASS21Results, hasCompletedDASS21 } = useAuth();

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

  // Use persistent chat hook with memory
  const {
    session,
    sessions,
    messages,
    memoryContext,
    isLoading,
    isGenerating,
    isSummarizing,
    selectedModel,
    ttsEnabled,
    createNewSession,
    loadSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    selectModel,
    toggleTTS,
    messagesEndRef,
  } = usePersistentChat({
    userName: user?.name || user?.username,
    dass21Results,
  });

  // Convert messages to the format expected by ChatArea
  const formattedMessages: Message[] = messages.map((msg, index) => ({
    id: msg.id || `msg-${index}`,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    createdAt: new Date(msg.timestamp),
    sessionId: session?.id || "temp",
    grammarSuggestions: null,
    feedback: null,
  }));

  // F009: Get personalized greeting
  const getPersonalizedGreeting = () => {
    const name = user?.name || user?.username || '';
    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour >= 5 && hour < 12) greeting = 'Good morning';
    else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17 && hour < 21) greeting = 'Good evening';

    return name ? `${greeting}, ${name}` : greeting;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Chat History Sidebar */}
      <ChatHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        sessions={sessions}
        currentSessionId={session?.id || null}
        onSelectSession={(id) => {
          loadSession(id);
          setShowHistory(false);
        }}
        onNewSession={() => {
          createNewSession();
          setShowHistory(false);
        }}
        onDeleteSession={deleteSession}
        isLoading={isLoading}
      />

      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          {/* History Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
            className={`h-10 w-10 rounded-lg hover:bg-gray-800 ${
              showHistory ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400'
            }`}
          >
            <History className="h-5 w-5" />
          </Button>

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
          {/* Memory indicator */}
          {memoryContext?.summary && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-purple-400 bg-purple-900/20 px-2 py-1 rounded">
              <Sparkles className="h-3 w-3" />
              Memory Active
              {isSummarizing && <span className="animate-pulse">•</span>}
            </div>
          )}

          {/* Model Selector */}
          <ModelSelector
            selectedModel={selectedModel || "llama-3.2-3b"}
            onModelSelect={selectModel}
            isLoading={isGenerating}
            onOpenSidebar={() => {}}
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {formattedMessages.length === 0 ? (
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

              {/* Memory info */}
              {sessions.length > 0 && (
                <p className="text-sm text-gray-500 mt-4">
                  You have {sessions.length} saved conversation{sessions.length !== 1 ? 's' : ''}.{' '}
                  <button
                    className="text-blue-400 hover:underline"
                    onClick={() => setShowHistory(true)}
                  >
                    View history
                  </button>
                </p>
              )}

              {/* F009: Show severity indicators if elevated */}
              {dass21Results && dass21Results.severityLevels && (
                <div className="flex justify-center gap-2 mt-4">
                  {dass21Results.severityLevels.depression?.level !== 'Normal' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-900/30 text-blue-400">
                      Depression Support Active
                    </span>
                  )}
                  {dass21Results.severityLevels.anxiety?.level !== 'Normal' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-900/30 text-amber-400">
                      Anxiety Support Active
                    </span>
                  )}
                  {dass21Results.severityLevels.stress?.level !== 'Normal' && (
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
                  disabled={isGenerating || isLoading}
                  placeholder="Share what's on your mind... I'm here to listen."
                  isWelcomeScreen={true}
                />
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 justify-center">
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("I'm feeling anxious and need someone to talk to")}
                >
                  Feeling Anxious
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("I'm dealing with stress and need coping strategies")}
                >
                  Managing Stress
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => sendMessage("I need help processing my emotions today")}
                >
                  Process Emotions
                </Button>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
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
            {/* Session info bar */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">
                  {session?.title || 'Current Chat'}
                </span>
                {memoryContext?.summary && (
                  <span className="text-xs text-purple-400 flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    {memoryContext.summary.messageCount} messages summarized
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={createNewSession}
                className="text-gray-400 hover:text-white h-7 px-2"
              >
                <Plus className="h-3 w-3 mr-1" />
                New Chat
              </Button>
            </div>

            <ChatArea
              messages={formattedMessages}
              isLoading={isGenerating}
              onRegenerateMessage={() => {}}
              isRegenerating={false}
              isWebllmGenerating={isGenerating}
              onStopGeneration={stopGeneration}
            />
            <div className="p-4 max-w-2xl mx-auto w-full">
              <InputArea
                onSendMessage={sendMessage}
                disabled={isGenerating || isLoading}
                placeholder="Continue the conversation..."
                isWelcomeScreen={false}
              />
            </div>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
