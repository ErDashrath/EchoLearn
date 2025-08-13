import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw, Bot, User, Lightbulb, CheckCircle, Volume2, VolumeX } from "lucide-react";
import type { Message, GrammarSuggestion, MessageFeedback } from "@/types/schema";
import { formatDistanceToNow } from "date-fns";
import { ttsService } from "@/lib/tts-service";

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
  isRegenerating?: boolean;
}

export function MessageBubble({ message, onRegenerate, isRegenerating }: MessageBubbleProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isUser = message.role === "user";
  const isAI = message.role === "assistant";

  const formatTime = (date: string | Date | null | undefined) => {
    if (!date) return "";
    const parsedDate = typeof date === "string" ? new Date(date) : date;
    if (!parsedDate || isNaN(parsedDate.getTime())) return "";
    return formatDistanceToNow(parsedDate, { addSuffix: true });
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      ttsService.stop();
    } else {
      ttsService.speak(message.content);
    }
  };

  // Listen for TTS state changes
  useEffect(() => {
    const unsubscribe = ttsService.onSpeakingStateChange(() => {
      setIsSpeaking(ttsService.isSpeaking());
    });

    return unsubscribe;
  }, []);

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
      transition={{ duration: 0.3 }}
      className={`flex items-start space-x-4 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
          <Bot className="h-5 w-5 text-white" />
        </div>
      )}

      <div className={`flex-1 ${isUser ? "max-w-sm sm:max-w-lg" : ""}`}>
        <div 
          className={`px-6 py-4 shadow-lg hover-lift ${
            isUser 
              ? "user-bubble rounded-3xl rounded-tr-lg text-gray-800 dark:text-gray-100" 
              : "ai-bubble rounded-3xl rounded-tl-lg"
          }`}
        >
          <p className={`leading-relaxed ${isUser ? "text-gray-800 dark:text-gray-100" : "text-foreground"}`}>
            {renderMessageWithSuggestions(message.content, message.grammarSuggestions || [])}
          </p>
        </div>

        <div className={`flex flex-wrap items-center mt-3 space-x-2 px-2 ${isUser ? "justify-end" : ""}`}>
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? "You" : "AI Tutor"}
          </span>
          <span className="text-xs text-muted-foreground/60">•</span>
          <span className="text-xs text-muted-foreground/80">
            {formatTime(message.createdAt)}
          </span>
          
          {/* Speak button for AI messages */}
          {isAI && (
            <>
              <span className="text-xs text-muted-foreground/60">•</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-auto p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    onClick={handleSpeak}
                  >
                    {isSpeaking ? (
                      <VolumeX className="h-3 w-3 mr-1" />
                    ) : (
                      <Volume2 className="h-3 w-3 mr-1" />
                    )}
                    {isSpeaking ? "Stop" : "Speak"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSpeaking ? "Stop speaking" : "Read message aloud"}
                </TooltipContent>
              </Tooltip>
            </>
          )}
          
          {/* Grammar suggestions toggle for user messages */}
          {isUser && message.grammarSuggestions && message.grammarSuggestions.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground/60">•</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                onClick={() => setShowSuggestions(!showSuggestions)}
              >
                <Lightbulb className="h-3 w-3 mr-1" />
                {showSuggestions ? "Hide Suggestions" : "Show Suggestions"}
              </Button>
            </>
          )}

          {/* Feedback toggle for AI messages */}
          {isAI && message.feedback && (
            <>
              <span className="text-xs text-muted-foreground/60">•</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                onClick={() => setShowFeedback(!showFeedback)}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                {showFeedback ? "Hide Feedback" : "Show Feedback"}
              </Button>
            </>
          )}
          
          {isAI && onRegenerate && (
            <>
              <span className="text-xs text-muted-foreground/60">•</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                onClick={() => onRegenerate(message.id)}
                disabled={isRegenerating}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </>
          )}
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

      {isUser && (
        <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-600 dark:from-gray-500 dark:to-gray-700 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
          <User className="h-5 w-5 text-white" />
        </div>
      )}
    </motion.div>
  );
}
