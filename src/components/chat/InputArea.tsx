import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { VoiceControls } from "./VoiceControls";
import { Send, Mic, MicOff } from "lucide-react";

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
  const [showVoiceControls, setShowVoiceControls] = useState(false);  
  const [isListening, setIsListening] = useState(false);
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

  const handleVoiceClick = () => {
    setIsListening(!isListening);
    setShowVoiceControls(!showVoiceControls);
  };

  const handleVoiceTranscript = (transcript: string) => {
    if (transcript.trim()) {
      onSendMessage(transcript.trim());
    }
    setShowVoiceControls(false);
    setIsListening(false);
  };

  if (isWelcomeScreen) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        {/* Voice Button */}
        <div className="flex justify-center mb-6">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              size="lg"
              onClick={handleVoiceClick}
              className={`w-14 h-14 rounded-full bg-[var(--inner)] hover:bg-[var(--card)] text-[var(--text-secondary)] shadow-sm transition-colors duration-200 ${
                isListening ? 'bg-[var(--card)] text-[var(--text-primary)]' : ''
              }`}
            >
              {isListening ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          </motion.div>
        </div>

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

        {/* Voice Controls */}
        <VoiceControls
          onTranscript={handleVoiceTranscript}
          onTextUpdate={(text) => updateMessage(text)}
          isVisible={showVoiceControls}
          onVisibilityChange={(visible) => {
            setShowVoiceControls(visible);
            if (!visible) setIsListening(false);
          }}
        />
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
            variant="ghost"
            size="sm"
            onClick={handleVoiceClick}
            className={`text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card)] rounded-full w-8 h-8 p-0 transition-colors duration-200 ${
              isListening ? 'text-[var(--text-primary)]' : ''
            }`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          
          <Button
            onClick={handleSend}
            disabled={!currentMessage.trim() || disabled}
            className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-full w-8 h-8 p-0 disabled:opacity-50 transition-colors duration-200"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Voice Controls */}
      <VoiceControls
        onTranscript={handleVoiceTranscript}
        onTextUpdate={(text) => updateMessage(text)}
        isVisible={showVoiceControls}
        onVisibilityChange={(visible) => {
          setShowVoiceControls(visible);
          if (!visible) setIsListening(false);
        }}
      />
    </div>
  );
}
