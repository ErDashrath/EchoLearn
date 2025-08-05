import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechRecognition } from "@/hooks/use-speech";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Send, X, RotateCcw } from "lucide-react";

interface VoiceControlsProps {
  onTranscript: (text: string) => void;
  isVisible: boolean;
  onVisibilityChange: (visible: boolean) => void;
  onTextUpdate?: (text: string) => void; // New prop to update input text
}

export function VoiceControls({ onTranscript, isVisible, onVisibilityChange, onTextUpdate }: VoiceControlsProps) {
  const [speakingSpeed, setSpeakingSpeed] = useState(1);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [lastSpeechTime, setLastSpeechTime] = useState<number>(0);
  
  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    toggleListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: true, // Enable continuous mode for better pause handling
    interimResults: true,
  });

  // Handle transcript completion and track speech activity
  useEffect(() => {
    if (transcript && !isListening) {
      setCurrentTranscript(transcript);
      resetTranscript();
    }
    
    // Update last speech time when we get new speech (interim or final)
    if (transcript || interimTranscript) {
      setLastSpeechTime(Date.now());
    }
  }, [transcript, isListening, interimTranscript, resetTranscript]);

  const handleSendTranscript = () => {
    if (currentTranscript.trim()) {
      onTranscript(currentTranscript.trim());
      setCurrentTranscript("");
      onVisibilityChange(false);
    }
  };

  const handleUseTranscript = () => {
    if (currentTranscript.trim() && onTextUpdate) {
      onTextUpdate(currentTranscript.trim());
      setCurrentTranscript("");
      onVisibilityChange(false);
    }
  };

  const handleRestartRecording = () => {
    setCurrentTranscript("");
    resetTranscript();
    toggleListening();
  };

  const handleCancel = () => {
    if (isListening) {
      toggleListening();
    }
    setCurrentTranscript("");
    resetTranscript();
    onVisibilityChange(false);
  };

  const handleToggleVoice = () => {
    if (!isSupported) {
      return;
    }
    
    if (!isListening && !currentTranscript) {
      onVisibilityChange(true);
      setCurrentTranscript("");
      toggleListening();
    } else if (isListening) {
      toggleListening();
    } else {
      // If we have a transcript but not listening, start over
      handleRestartRecording();
    }
  };

  if (!isSupported) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="text-muted-foreground"
      >
        <MicOff className="h-4 w-4 mr-2" />
        Voice not supported
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Voice Input {isListening ? "Active" : "Ready"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isListening ? (
                  (transcript || interimTranscript) ? 
                    "Speaking... (2.5s pause to finish)" : 
                    "Listening..."
                ) : "Click mic to start"}
              </span>
            </div>
            
            {/* Waveform Visualization */}
            <div className="flex items-center justify-center space-x-1 h-8">
              {Array.from({ length: 15 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-blue-500 dark:bg-blue-400 rounded-full"
                  animate={{
                    height: isListening 
                      ? [4, Math.random() * 16 + 8, 4]
                      : 4,
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: isListening ? Infinity : 0,
                    delay: i * 0.1,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
            
            {/* Current transcript display */}
            {(currentTranscript || transcript || interimTranscript) && (
              <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                <p className="text-sm text-slate-700 dark:text-slate-300 min-h-[20px]">
                  <span className="font-medium">{currentTranscript || transcript}</span>
                  <span className="text-slate-400 italic">{interimTranscript}</span>
                </p>
                
                {/* Action buttons when we have a completed transcript */}
                {currentTranscript && !isListening && (
                  <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                    <Button
                      onClick={handleSendTranscript}
                      size="sm"
                      className="flex-1 bg-green-500 hover:bg-green-600"
                    >
                      <Send className="h-3 w-3 mr-2" />
                      Send Now
                    </Button>
                    <Button
                      onClick={handleUseTranscript}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      Use in Input
                    </Button>
                    <Button
                      onClick={handleRestartRecording}
                      size="sm"
                      variant="outline"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                    <Button
                      onClick={handleCancel}
                      size="sm"
                      variant="outline"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {/* Speaking Speed Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Speaking Speed:
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {speakingSpeed.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[speakingSpeed]}
                onValueChange={(value) => setSpeakingSpeed(value[0])}
                min={0.5}
                max={2}
                step={0.1}
                className="w-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <Button
        onClick={handleToggleVoice}
        variant={isListening ? "destructive" : currentTranscript ? "secondary" : "default"}
        size="icon"
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 ${
          isListening 
            ? "bg-red-500 hover:bg-red-600" 
            : currentTranscript
            ? "bg-yellow-500 hover:bg-yellow-600"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        title={
          isListening 
            ? "Stop recording" 
            : currentTranscript 
            ? "Record again" 
            : "Start voice input"
        }
      >
        {isListening ? (
          <MicOff className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
