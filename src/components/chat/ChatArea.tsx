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
    transition={{ duration: 0.2 }}
     className="flex items-start space-x-4"
  >
     <div className="w-10 h-10 bg-[var(--inner)] rounded-2xl flex items-center justify-center flex-shrink-0">
       <Bot className="h-5 w-5 text-[var(--text-secondary)]" />
    </div>
    <div className="flex-1">
       <div className="rounded-[20px] rounded-tl-md px-6 py-5 bg-[var(--card)] shadow-sm">
         <p className="text-[var(--text-primary)] leading-relaxed">
           What&apos;s been on your mind lately?
        </p>
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

  const getMessageSpacing = (index: number) => {
    const current = messages[index];
    const next = messages[index + 1];
    if (!next) return 'mb-[18px]';
    return current.role !== next.role ? 'mb-[28px]' : 'mb-[18px]';
  };

  return (
     <ScrollArea className="flex-1 bg-[var(--bg)]">
       <div className="px-6 py-8 max-w-[720px] mx-auto">
        <p className="text-xs text-[#3A4A63]/70 text-center mb-6">This is your space. You can take your time.</p>
        {/* Welcome message when no messages */}
        {messages.length === 0 && !isLoading && <WelcomeMessage />}
        
        {/* Messages */}
        <AnimatePresence>
          {messages.map((message, index) => (
            <div key={message.id} className={getMessageSpacing(index)}>
              <MessageBubble
                message={message}
                onRegenerate={onRegenerateMessage}
                isRegenerating={isRegenerating}
              />
            </div>
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
               <div className="text-[var(--text-secondary)] text-sm">Reflecting...</div>
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
                 className="bg-[var(--card)] border-[var(--inner)] text-[var(--text-secondary)] hover:bg-[var(--inner)] transition-colors duration-200"
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
