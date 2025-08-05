import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceControls } from "./VoiceControls";
import { SystemPromptManager } from "./SystemPromptManager";
import { Send, Paperclip, Settings } from "lucide-react";

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onSystemPromptChange?: (prompt: string, isEnabled: boolean) => void;
}

const QUICK_PROMPTS = [
  "Tell me about yourself",
  "Practice job interview",
  "Casual conversation",
  "Help with pronunciation",
  "Grammar practice",
];

export function InputArea({ onSendMessage, disabled, placeholder, onSystemPromptChange }: InputAreaProps) {
  const [message, setMessage] = useState("");
  const [showVoiceControls, setShowVoiceControls] = useState(false);  
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setMessage(prompt);
  };

  const handleVoiceTranscript = (transcript: string) => {
    if (transcript.trim()) {
      onSendMessage(transcript.trim());
    }
    setShowVoiceControls(false);
  };

  const handleVoiceTextUpdate = (text: string) => {
    setMessage(text);
  };

  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-white/20 dark:border-gray-700/30">
      <div className="px-6 py-6">
        {/* System Prompt Manager */}
        <AnimatePresence>
          {showSystemPrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4"
            >
              <SystemPromptManager 
                onPromptChange={onSystemPromptChange}
                className="w-full"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice Controls */}
        <VoiceControls
          onTranscript={handleVoiceTranscript}
          onTextUpdate={handleVoiceTextUpdate}
          isVisible={showVoiceControls}
          onVisibilityChange={setShowVoiceControls}
        />

        {/* Text Input */}
        <div className="flex items-end space-x-4 mt-4">
          <div className="flex-1">
            <div className="relative">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || "Type your message or press the mic button to speak..."}
                className="min-h-[60px] max-h-[140px] pr-20 resize-none bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-white/40 dark:border-gray-600/40 rounded-2xl text-base leading-relaxed shadow-lg hover-lift focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400/50"
                disabled={disabled}
              />
              
              <div className="absolute right-3 bottom-3 flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  className={`h-8 w-8 p-0 rounded-xl transition-colors ${
                    showSystemPrompt 
                      ? 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Quick Prompts */}
            <div className="flex items-center space-x-2 mt-3 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((prompt, index) => (
                <motion.button
                  key={prompt}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleQuickPrompt(prompt)}
                  className="flex-shrink-0 px-4 py-2 text-sm rounded-2xl bg-white/60 dark:bg-gray-700/60 border border-white/40 dark:border-gray-600/40 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-gray-600/80 hover-lift transition-all shadow-sm"
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </div>
          
          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            size="icon"
            className="w-14 h-14 rounded-2xl button-gradient shadow-xl hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
