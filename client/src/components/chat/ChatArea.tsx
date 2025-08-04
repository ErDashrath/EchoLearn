import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot } from "lucide-react";
import type { Message } from "@shared/schema";

interface ChatAreaProps {
  messages: Message[];
  isLoading?: boolean;
  onRegenerateMessage?: (messageId: string) => void;
  isRegenerating?: boolean;
}

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="flex items-start space-x-3"
  >
    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
      <Bot className="h-4 w-4 text-white" />
    </div>
    <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border">
      <div className="flex items-center space-x-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </div>
  </motion.div>
);

const WelcomeMessage = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-start space-x-3"
  >
    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
      <Bot className="h-4 w-4 text-white" />
    </div>
    <div className="flex-1">
      <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border">
        <p className="text-foreground">
          Hello! I'm your AI English tutor. I'm here to help you practice conversation, 
          prepare for interviews, or work on specific language skills. How would you like to start today?
        </p>
      </div>
      <div className="flex items-center space-x-2 mt-2">
        <span className="text-xs text-muted-foreground">AI Tutor</span>
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs text-muted-foreground">Just now</span>
      </div>
    </div>
  </motion.div>
);

export function ChatArea({ messages, isLoading, onRegenerateMessage, isRegenerating }: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <ScrollArea className="flex-1 px-4 py-6">
      <div className="space-y-6 max-w-4xl mx-auto">
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
        
        {/* Typing indicator */}
        <AnimatePresence>
          {isLoading && <TypingIndicator />}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
