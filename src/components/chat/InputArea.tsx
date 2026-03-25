import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isWelcomeScreen?: boolean;
  draftMessage?: string;
  onDraftChange?: (message: string) => void;
}

export function InputArea({ 
  onSendMessage, 
  disabled, 
  placeholder = "Start typing... no structure needed.", 
  isWelcomeScreen = false,
  draftMessage,
  onDraftChange
}: InputAreaProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controlled = typeof draftMessage === "string";
  const currentMessage = controlled ? draftMessage : message;

  const updateMessage = (nextValue: string) => {
    if (controlled) {
      onDraftChange?.(nextValue);
      return;
    }
    setMessage(nextValue);
  };

  const handleSend = () => {
    if (currentMessage.trim() && !disabled) {
      onSendMessage(currentMessage.trim());
      updateMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  if (isWelcomeScreen) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        {/* Input Container */}
        <div className="relative bg-[var(--card)] rounded-[20px] border border-[rgba(216,122,67,0.2)] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden focus-within:border-[var(--accent)] transition-colors duration-200">
          <div className="flex items-end p-4 gap-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] border-none outline-none resize-none text-lg leading-relaxed min-h-[56px] max-h-[200px] caret-[var(--accent)]"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSend}
                disabled={!currentMessage.trim() || disabled}
                className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-full w-12 h-12 p-0 disabled:opacity-50 transition-colors duration-200"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular chat input (compact version)
  return (
    <div className="relative bg-[var(--card)] rounded-[20px] border border-[rgba(216,122,67,0.2)] shadow-[0_4px_20px_rgba(0,0,0,0.05)] focus-within:border-[var(--accent)] transition-colors duration-200">
      <div className="flex items-end p-4 gap-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={currentMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] border-none outline-none resize-none leading-relaxed min-h-[40px] max-h-[120px] caret-[var(--accent)]"
          />
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            onClick={handleSend}
            disabled={!currentMessage.trim() || disabled}
            className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-full w-8 h-8 p-0 disabled:opacity-50 transition-colors duration-200"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
