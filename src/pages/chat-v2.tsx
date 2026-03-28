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
import { usePersistentChat } from "@/hooks/use-persistent-chat";
import { useAuth } from "@/contexts/AuthContext";
import {
  History,
  Plus,
} from "lucide-react";
import type { DASS21Results } from "@/services/mental-health-prompt-service";
import type { Message } from "@/types/schema";

export default function ChatPage() {
  const [showHistory, setShowHistory] = useState(false);
  const [dass21Results, setDass21Results] = useState<DASS21Results | null>(null);
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const { user, getDASS21Results, hasCompletedDASS21 } = useAuth();
  const suggestionChips = [
    'Feeling overwhelmed',
    'Just want to talk',
    'Reflect on today',
  ];

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
    isLoading,
    isGenerating,
    createNewSession,
    loadSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    messagesEndRef,
  } = usePersistentChat({
    userName: user?.username || user?.name,
    dass21Results,
  });

  useEffect(() => {
    const runAction = (action: 'new' | 'history') => {
      if (action === 'new') {
        createNewSession();
      } else {
        setShowHistory(true);
      }
    };

    const pending = sessionStorage.getItem('pendingChatAction') as 'new' | 'history' | null;
    if (pending) {
      runAction(pending);
      sessionStorage.removeItem('pendingChatAction');
    }

    const onAction = (event: Event) => {
      const customEvent = event as CustomEvent<'new' | 'history'>;
      if (customEvent.detail === 'new' || customEvent.detail === 'history') {
        runAction(customEvent.detail);
        sessionStorage.removeItem('pendingChatAction');
      }
    };

    window.addEventListener('mindscribe:chat-action', onAction as EventListener);
    return () => window.removeEventListener('mindscribe:chat-action', onAction as EventListener);
  }, [createNewSession]);

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

  return (
    <div className="journal-shell min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex flex-col [font-family:Inter,sans-serif]">
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
      <header className="flex items-center justify-between p-5 border-b border-[var(--inner)]">
        <div className="flex items-center space-x-4">
          {/* History Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
            className={`h-10 w-10 rounded-lg transition-colors duration-200 ${
              showHistory ? 'text-[var(--text-primary)] bg-[var(--inner)]' : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]'
            }`}
          >
            <History className="h-5 w-5" />
          </Button>

          <div className="flex flex-col">
            <span className="nav-title text-lg text-[var(--text-primary)]">MindScribe</span>
            <span className="text-xs text-[var(--text-secondary)]">This is your space. You can take your time.</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewSession}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--inner)] transition-colors duration-200"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Chat
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {formattedMessages.length === 0 ? (
          /* Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-[720px] mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <h1 className="greeting text-[var(--text-primary)]">
                What&apos;s been on your mind today?
              </h1>

              <div className="flex items-center justify-center gap-2 flex-wrap mt-4">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setWelcomeDraft(chip)}
                    className="bg-[var(--inner)] rounded-full px-[14px] py-[8px] text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--card)] transition-colors duration-200"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Memory info */}
              {sessions.length > 0 && (
                <p className="text-sm text-[var(--text-secondary)] mt-4">
                  You have {sessions.length} saved conversation{sessions.length !== 1 ? 's' : ''}.{' '}
                  <button
                    className="text-[var(--text-primary)] hover:underline"
                    onClick={() => setShowHistory(true)}
                  >
                    View history
                  </button>
                </p>
              )}
            </motion.div>

            {/* Input Area */}
            <div className="w-full max-w-[720px]">
              <div className="sticky bottom-5 z-20">
                <InputArea
                  onSendMessage={sendMessage}
                  disabled={isGenerating || isLoading}
                  placeholder="Start typing... no structure needed."
                  isWelcomeScreen={true}
                  draftMessage={welcomeDraft}
                  onDraftChange={setWelcomeDraft}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Chat Area */
          <div className="flex-1 flex flex-col">
            <ChatArea
              messages={formattedMessages}
              isLoading={isGenerating}
              onRegenerateMessage={() => {}}
              isRegenerating={false}
              isWebllmGenerating={isGenerating}
              onStopGeneration={stopGeneration}
            />
            <div className="sticky bottom-5 z-20 p-5 max-w-[720px] mx-auto w-full">
              <InputArea
                onSendMessage={sendMessage}
                disabled={isGenerating || isLoading}
                placeholder="Start typing... no structure needed."
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
