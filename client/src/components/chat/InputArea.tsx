import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceControls } from "./VoiceControls";
import { Send, Paperclip } from "lucide-react";

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const QUICK_PROMPTS = [
  "Tell me about yourself",
  "Practice job interview",
  "Casual conversation",
  "Help with pronunciation",
  "Grammar practice",
];

export function InputArea({ onSendMessage, disabled, placeholder }: InputAreaProps) {
  const [message, setMessage] = useState("");
  const [showVoiceControls, setShowVoiceControls] = useState(false);

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

  return (
    <div className="border-t border-border bg-background px-4 py-4">
      {/* Voice Controls */}
      <VoiceControls
        onTranscript={handleVoiceTranscript}
        isVisible={showVoiceControls}
        onVisibilityChange={setShowVoiceControls}
      />

      {/* Text Input */}
      <div className="flex items-end space-x-3 mt-4">
        <div className="flex-1">
          <div className="relative">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || "Type your message or press the mic button to speak..."}
              className="min-h-[48px] max-h-[120px] pr-12 resize-none"
              disabled={disabled}
            />
            
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 bottom-3 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Quick Prompts */}
          <div className="flex items-center space-x-2 mt-2 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((prompt, index) => (
              <motion.button
                key={prompt}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleQuickPrompt(prompt)}
                className="flex-shrink-0 px-3 py-1 text-xs rounded-full border border-border bg-background hover:bg-accent transition-colors"
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
          className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-lg"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
