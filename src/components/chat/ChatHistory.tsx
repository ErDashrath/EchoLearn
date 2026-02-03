/**
 * F010: Chat History Sidebar Component
 * 
 * Displays chat session history with ability to switch between sessions.
 * 
 * @module components/chat/ChatHistory
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Plus,
  Trash2,
  X,
  Clock,
  Brain,
} from 'lucide-react';
import type { ChatSession } from '@/services/chat-memory-service';

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  isLoading?: boolean;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isLoading = false,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getSessionPreview = (session: ChatSession): string => {
    if (session.messages.length === 0) return 'New conversation';
    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      return lastUserMsg.content.length > 60 
        ? lastUserMsg.content.substring(0, 60) + '...'
        : lastUserMsg.content;
    }
    return 'Conversation started';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 h-full w-80 bg-dark-bg border-r border-dark-border z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-400" />
                <h2 className="font-semibold text-dark-text">Chat History</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-dark-text-secondary hover:text-dark-text"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* New Chat Button */}
            <div className="p-3 border-b border-dark-border">
              <Button
                onClick={onNewSession}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            </div>

            {/* Session List */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {isLoading ? (
                  <div className="text-center py-8 text-dark-text-secondary">
                    Loading sessions...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8 text-dark-text-secondary">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No chat history yet</p>
                    <p className="text-sm">Start a new conversation</p>
                  </div>
                ) : (
                  sessions.map((session) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`
                        group relative p-3 rounded-lg cursor-pointer transition-colors
                        ${currentSessionId === session.id
                          ? 'bg-blue-900/30 border border-blue-800'
                          : 'hover:bg-dark-bg-secondary border border-transparent'
                        }
                      `}
                      onClick={() => onSelectSession(session.id)}
                    >
                      {/* Session Title */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-dark-text text-sm truncate flex-1">
                          {session.title}
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-dark-text-secondary hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Preview */}
                      <p className="text-xs text-dark-text-secondary mt-1 truncate">
                        {getSessionPreview(session)}
                      </p>

                      {/* Meta info */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-dark-text-secondary">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(session.updatedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {session.messages.length}
                        </span>
                        {session.summary && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Brain className="h-3 w-3" />
                            Summarized
                          </span>
                        )}
                      </div>

                      {/* Summary topics */}
                      {session.summary && session.summary.keyTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {session.summary.keyTopics.slice(0, 3).map((topic, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 bg-dark-bg-secondary text-dark-text-secondary rounded"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-dark-border text-xs text-dark-text-secondary text-center">
              {sessions.length} conversation{sessions.length !== 1 ? 's' : ''} saved locally
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatHistory;
