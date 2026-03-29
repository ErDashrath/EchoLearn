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
    inferenceSelectionMode,
    setInferenceSelectionMode,
    activeInferenceProvider,
    inferenceCapabilities,
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
          <div className="flex items-center rounded-lg border border-[var(--inner)] overflow-hidden">
            <button
              type="button"
              onClick={() => setInferenceSelectionMode('auto')}
              className={`px-2 py-1 text-xs ${
                inferenceSelectionMode === 'auto'
                  ? 'bg-[var(--inner)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]'
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setInferenceSelectionMode('webllm-webgpu')}
              className={`px-2 py-1 text-xs border-l border-[var(--inner)] ${
                inferenceSelectionMode === 'webllm-webgpu'
                  ? 'bg-[var(--inner)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]'
              }`}
            >
              WebGPU
            </button>
            <button
              type="button"
              onClick={() => setInferenceSelectionMode('native-cpu')}
              className={`px-2 py-1 text-xs border-l border-[var(--inner)] ${
                inferenceSelectionMode === 'native-cpu'
                  ? 'bg-[var(--inner)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]'
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

      {inferenceBlocked && (
        <div className="px-5 pt-4">
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
                  disabled={isGenerating || isLoading || inferenceBlocked}
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
                disabled={isGenerating || isLoading || inferenceBlocked}
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
