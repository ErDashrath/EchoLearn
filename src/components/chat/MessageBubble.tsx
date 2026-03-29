import { useState } from "react";
import { motion } from "framer-motion";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Lightbulb, CheckCircle, Copy, Check } from "lucide-react";
import type { Message, GrammarSuggestion, MessageFeedback } from "@/types/schema";

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
  isRegenerating?: boolean;
}

export function MessageBubble({ message, onRegenerate, isRegenerating }: MessageBubbleProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isAI = message.role === "assistant";

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatTime = (date: Date | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const renderMessageWithSuggestions = (content: string, suggestions: GrammarSuggestion[]) => {
    if (!suggestions || suggestions.length === 0) {
      return content;
    }

    // For now, just return the original content with grammar suggestions shown separately
    // TODO: Implement proper text highlighting system for inline suggestions
    return content;
  };

  const FeedbackCard = ({ feedback }: { feedback: MessageFeedback }) => {
    const getIconAndColor = (type: string) => {
      switch (type) {
        case "grammar":
          return { 
            icon: <Lightbulb className="h-4 w-4" />, 
            color: "bg-yellow-50 dark:bg-yellow-900 dark:bg-opacity-20 border-yellow-200 dark:border-yellow-800",
            textColor: "text-yellow-800 dark:text-yellow-200",
            subtextColor: "text-yellow-700 dark:text-yellow-300"
          };
        case "progress":
          return { 
            icon: <CheckCircle className="h-4 w-4" />, 
            color: "bg-emerald-50 dark:bg-emerald-900 dark:bg-opacity-20 border-emerald-200 dark:border-emerald-800",
            textColor: "text-emerald-800 dark:text-emerald-200",
            subtextColor: "text-emerald-700 dark:text-emerald-300"
          };
        default:
          return { 
            icon: <CheckCircle className="h-4 w-4" />, 
            color: "bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 border-blue-200 dark:border-blue-800",
            textColor: "text-blue-800 dark:text-blue-200",
            subtextColor: "text-blue-700 dark:text-blue-300"
          };
      }
    };

    const { icon, color, textColor, subtextColor } = getIconAndColor(feedback.type);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className={`mt-4 p-4 rounded-2xl border ${color} shadow-lg backdrop-blur-sm`}
      >
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-current to-current rounded-xl flex items-center justify-center flex-shrink-0 opacity-80">
            {icon}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${textColor} mb-2`}>{feedback.title}</p>
            <p className={`text-sm leading-relaxed ${subtextColor}`}>{feedback.message}</p>
          </div>
        </div>
      </motion.div>
    );
  };

  const GrammarSuggestionsCard = ({ suggestions }: { suggestions: GrammarSuggestion[] }) => {
    if (!suggestions || suggestions.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 shadow-lg backdrop-blur-sm"
      >
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
              Grammar Suggestions
            </p>
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <motion.div 
                  key={index} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="bg-white/60 dark:bg-black/20 rounded-xl p-3 border border-amber-100 dark:border-amber-800/30"
                >
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                    <span className="font-medium bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-lg">"{suggestion.original}"</span>
                    <span className="mx-2 text-amber-400">→</span>
                    <span className="font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg">"{suggestion.suggestion}"</span>
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                    {suggestion.reason}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start ${isUser ? "justify-end" : ""}`}
    >
      <div className={`w-full ${isUser ? "flex justify-end" : ""}`}>
        <div className={`${isUser ? "max-w-[70%]" : "w-full max-w-[75%]"}`}>
          <div 
            className={`chat-message ${
              isUser 
                ? "bg-[#D87A43] rounded-[18px] px-4 py-2 text-white"
                : "bg-transparent px-0 py-0"
            }`}
            style={{
              userSelect: 'text',
            }}
          >
            {isAI ? (
              <MarkdownRenderer 
                content={message.content} 
                className="text-[#2E3A4F] text-[1.03rem] leading-[1.7]"
              />
            ) : (
              <p className="leading-relaxed text-white">
                {renderMessageWithSuggestions(message.content, message.grammarSuggestions || [])}
              </p>
            )}
          </div>

          {/* Timestamp and Copy Button */}
          <div className={`flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"} text-xs`}>
            <span className="text-[var(--text-secondary)]">
              {formatTime(message.createdAt)}
            </span>
            <button
              onClick={handleCopyMessage}
              className="inline-flex items-center justify-center p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--inner)] hover:text-[var(--text-primary)] transition-colors duration-150"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Grammar suggestions for user messages */}
          {isUser && message.grammarSuggestions && message.grammarSuggestions.length > 0 && showSuggestions && (
            <GrammarSuggestionsCard suggestions={message.grammarSuggestions} />
          )}

          {/* Feedback for AI messages */}
          {isAI && message.feedback && showFeedback && (
            <FeedbackCard feedback={message.feedback} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
