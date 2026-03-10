import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bot, Square } from "lucide-react";
import type { Message } from "@/types/schema";

interface ChatAreaProps {
  messages: Message[];
  isLoading?: boolean;
  onRegenerateMessage?: (messageId: string) => void;
  isRegenerating?: boolean;
  isWebllmGenerating?: boolean;
  onStopGeneration?: () => void;
}

const WelcomeMessage = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-start space-x-4"
  >
    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
      <Bot className="h-5 w-5 text-dark-text" />
    </div>
    <div className="flex-1">
      <div className="ai-bubble rounded-3xl rounded-tl-lg px-6 py-4 shadow-lg hover-lift">
        <p className="text-foreground leading-relaxed">
          Hello! I'm your AI English tutor. I'm here to help you practice conversation, 
          prepare for interviews, or work on specific language skills. How would you like to start today?
        </p>
      </div>
      <div className="flex items-center space-x-2 mt-3 px-2">
        <span className="text-xs font-medium text-muted-foreground">Your Therapist</span>
        <span className="text-xs text-muted-foreground/60">•</span>
        <span className="text-xs text-muted-foreground/80">Just now</span>
      </div>
    </div>
  </motion.div>
);

export function ChatArea({ 
  messages, 
  isLoading, 
  onRegenerateMessage, 
  isRegenerating,
  isWebllmGenerating,
  onStopGeneration 
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <ScrollArea className="flex-1">
      <div className="px-6 py-8 space-y-6 max-w-2xl mx-auto">
        {/* Welcome message when no messages */}
        {messages.length === 0 && !isLoading && <WelcomeMessage />}
        
        {/* Messages */}
        <AnimatePresence>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRegenerate={onRegenerateMessage}
              isRegenerating={isRegenerating}
            />
          ))}
        </AnimatePresence>
        
        {/* Simple loading indicator */}
        <AnimatePresence>
          {(isLoading || isWebllmGenerating) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-4"
            >
              <div className="text-dark-text-secondary text-sm">AI is thinking...</div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Stop generation button for WebLLM */}
        <AnimatePresence>
          {isWebllmGenerating && onStopGeneration && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-center"
            >
              <Button
                onClick={onStopGeneration}
                variant="outline"
                size="sm"
                className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                <Square className="h-3 w-3 mr-2" />
                Stop Generation
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
