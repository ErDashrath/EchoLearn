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
    className="flex items-start space-x-4"
  >
    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
      <Bot className="h-5 w-5 text-white" />
    </div>
    <div className="ai-bubble rounded-3xl rounded-tl-lg px-6 py-4 shadow-lg">
      <div className="flex items-center space-x-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2.5 h-2.5 bg-purple-400 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
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
    className="flex items-start space-x-4"
  >
    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
      <Bot className="h-5 w-5 text-white" />
    </div>
    <div className="flex-1">
      <div className="ai-bubble rounded-3xl rounded-tl-lg px-6 py-4 shadow-lg hover-lift">
        <p className="text-foreground leading-relaxed">
          Hello! I'm your AI English tutor. I'm here to help you practice conversation, 
          prepare for interviews, or work on specific language skills. How would you like to start today?
        </p>
      </div>
      <div className="flex items-center space-x-2 mt-3 px-2">
        <span className="text-xs font-medium text-muted-foreground">AI Tutor</span>
        <span className="text-xs text-muted-foreground/60">•</span>
        <span className="text-xs text-muted-foreground/80">Just now</span>
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
    <ScrollArea className="flex-1">
      <div className="max-w-[700px] mx-auto px-6 py-8 space-y-6">
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
