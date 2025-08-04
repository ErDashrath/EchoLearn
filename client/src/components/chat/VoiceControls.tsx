import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechRecognition } from "@/hooks/use-speech";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

interface VoiceControlsProps {
  onTranscript: (text: string) => void;
  isVisible: boolean;
  onVisibilityChange: (visible: boolean) => void;
}

export function VoiceControls({ onTranscript, isVisible, onVisibilityChange }: VoiceControlsProps) {
  const [speakingSpeed, setSpeakingSpeed] = useState(1);
  
  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    toggleListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: false,
    interimResults: true,
  });

  // Handle transcript completion
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, isListening, onTranscript, resetTranscript]);

  const handleToggleVoice = () => {
    if (!isSupported) {
      return;
    }
    
    if (!isListening) {
      onVisibilityChange(true);
      toggleListening();
    } else {
      toggleListening();
      setTimeout(() => {
        onVisibilityChange(false);
      }, 500);
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
                {isListening ? "Listening..." : "Click mic to start"}
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
            {(transcript || interimTranscript) && (
              <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{transcript}</span>
                  <span className="text-slate-400 italic">{interimTranscript}</span>
                </p>
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
        variant={isListening ? "destructive" : "default"}
        size="icon"
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 ${
          isListening 
            ? "bg-red-500 hover:bg-red-600" 
            : "bg-blue-500 hover:bg-blue-600"
        }`}
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
