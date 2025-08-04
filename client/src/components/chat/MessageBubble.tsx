import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw, Bot, User, Lightbulb, CheckCircle, AlertCircle } from "lucide-react";
import type { Message, GrammarSuggestion, MessageFeedback } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
  isRegenerating?: boolean;
}

export function MessageBubble({ message, onRegenerate, isRegenerating }: MessageBubbleProps) {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const isUser = message.role === "user";
  const isAI = message.role === "assistant";

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const renderMessageWithSuggestions = (content: string, suggestions: GrammarSuggestion[]) => {
    if (!suggestions || suggestions.length === 0) {
      return content;
    }

    let result = content;
    let offset = 0;

    // Sort suggestions by start index to process them in order
    const sortedSuggestions = [...suggestions].sort((a, b) => a.startIndex - b.startIndex);

    sortedSuggestions.forEach((suggestion) => {
      const startIndex = suggestion.startIndex + offset;
      const endIndex = suggestion.endIndex + offset;
      const originalText = result.slice(startIndex, endIndex);
      
      const highlightedText = (
        <Tooltip key={`suggestion-${startIndex}`}>
          <TooltipTrigger asChild>
            <span className="underline decoration-yellow-300 dark:decoration-yellow-500 decoration-2 cursor-help bg-yellow-50 dark:bg-yellow-900 dark:bg-opacity-30 px-1 rounded">
              {originalText}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">Suggestion: {suggestion.suggestion}</p>
              <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      );

      // This is a simplified approach - in a real implementation, you'd need
      // a more sophisticated text highlighting system
      result = result.slice(0, startIndex) + `__HIGHLIGHT_${startIndex}__` + result.slice(endIndex);
      offset += `__HIGHLIGHT_${startIndex}__`.length - (endIndex - startIndex);
    });

    // For now, just return the original content with grammar suggestions shown separately
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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`mt-3 p-3 rounded-xl border ${color}`}
      >
        <div className="flex items-start space-x-2">
          <div className={textColor}>{icon}</div>
          <div className="flex-1">
            <p className={`text-sm font-medium ${textColor}`}>{feedback.title}</p>
            <p className={`text-sm mt-1 ${subtextColor}`}>{feedback.message}</p>
          </div>
        </div>
      </motion.div>
    );
  };

  const GrammarSuggestionsCard = ({ suggestions }: { suggestions: GrammarSuggestion[] }) => {
    if (!suggestions || suggestions.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-3 bg-yellow-50 dark:bg-yellow-900 dark:bg-opacity-20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3"
      >
        <div className="flex items-start space-x-2">
          <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              Grammar Suggestions
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <div key={index} className="text-sm">
                  <p className="text-yellow-700 dark:text-yellow-300">
                    <span className="font-medium">"{suggestion.original}"</span> → 
                    <span className="font-medium text-emerald-600 dark:text-emerald-400"> "{suggestion.suggestion}"</span>
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    {suggestion.reason}
                  </p>
                </div>
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
      className={`flex items-start space-x-3 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={`flex-1 ${isUser ? "max-w-xs sm:max-w-md" : ""}`}>
        <Card 
          className={`px-4 py-3 ${
            isUser 
              ? "bg-blue-500 text-white border-blue-500 rounded-2xl rounded-tr-sm" 
              : "bg-card rounded-2xl rounded-tl-sm"
          }`}
        >
          <p className={isUser ? "text-white" : "text-foreground"}>
            {renderMessageWithSuggestions(message.content, message.grammarSuggestions || [])}
          </p>
        </Card>

        <div className={`flex items-center mt-2 space-x-2 ${isUser ? "justify-end" : ""}`}>
          <span className="text-xs text-muted-foreground">
            {isUser ? "You" : "AI Tutor"}
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          
          {isAI && onRegenerate && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1 text-blue-500 hover:text-blue-600"
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
        {isUser && message.grammarSuggestions && message.grammarSuggestions.length > 0 && (
          <GrammarSuggestionsCard suggestions={message.grammarSuggestions} />
        )}

        {/* Feedback for AI messages */}
        {isAI && message.feedback && (
          <FeedbackCard feedback={message.feedback} />
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </motion.div>
  );
}
