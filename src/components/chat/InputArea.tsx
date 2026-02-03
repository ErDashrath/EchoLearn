import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { VoiceControls } from "./VoiceControls";
import { Send, Paperclip, Mic, MicOff } from "lucide-react";

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isWelcomeScreen?: boolean;
}

export function InputArea({ 
  onSendMessage, 
  disabled, 
  placeholder = "Ask your English tutor anything...", 
  isWelcomeScreen = false 
}: InputAreaProps) {
  const [message, setMessage] = useState("");
  const [showVoiceControls, setShowVoiceControls] = useState(false);  
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
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
    setMessage(e.target.value);
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
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              size="lg"
              onClick={handleVoiceClick}
              className={`w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg ${
                isListening ? 'animate-pulse bg-red-500 hover:bg-red-600' : ''
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
        <div className="relative bg-dark-bg-secondary rounded-3xl border border-dark-border shadow-2xl overflow-hidden">
          <div className="flex items-end p-4 gap-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className="w-full bg-transparent text-dark-text placeholder-dark-text-secondary border-none outline-none resize-none text-lg leading-relaxed min-h-[56px] max-h-[200px]"
                style={{ height: 'auto' }}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg-secondary/80 rounded-full"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              
              <Button
                onClick={handleSend}
                disabled={!message.trim() || disabled}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 p-0 disabled:opacity-50"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Voice Controls */}
        <VoiceControls
          onTranscript={handleVoiceTranscript}
          onTextUpdate={(text) => setMessage(text)}
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
    <div className="relative bg-dark-bg-secondary rounded-2xl border border-dark-border shadow-lg">
      <div className="flex items-end p-3 gap-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-dark-text placeholder-dark-text-secondary border-none outline-none resize-none leading-relaxed min-h-[40px] max-h-[120px]"
          />
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleVoiceClick}
            className={`text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg-secondary/80 rounded-full w-8 h-8 p-0 ${
              isListening ? 'text-red-400' : ''
            }`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          
          <Button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-8 h-8 p-0 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Voice Controls */}
      <VoiceControls
        onTranscript={handleVoiceTranscript}
        onTextUpdate={(text) => setMessage(text)}
        isVisible={showVoiceControls}
        onVisibilityChange={(visible) => {
          setShowVoiceControls(visible);
          if (!visible) setIsListening(false);
        }}
      />
    </div>
  );
}
