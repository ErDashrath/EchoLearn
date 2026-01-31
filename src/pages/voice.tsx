/**
 * F012-F016: Voice Therapy Page
 * 
 * ASMR-style voice interaction with AI therapist.
 * Features:
 * - Push-to-talk or continuous listening
 * - Beautiful audio visualization
 * - Soft, soothing TTS voice
 * - Ambient, calming UI design
 * 
 * @module pages/voice
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoice } from '@/hooks/use-voice';
import { webllmService } from '@/services/webllm-service';
import { useAuth } from '@/contexts/AuthContext';
import { mentalHealthPromptService } from '@/services/mental-health-prompt-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings2,
  Sparkles,
  Waves,
  Heart,
  Moon,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PiperVoice } from '@/services/voice-service';

// =============================================================================
// AUDIO VISUALIZER COMPONENT
// =============================================================================

interface AudioVisualizerProps {
  isActive: boolean;
  getWaveformData: () => Uint8Array | null;
  variant: 'listening' | 'speaking' | 'idle';
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  isActive, 
  getWaveformData,
  variant 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const colors = {
    listening: { primary: '#8B5CF6', secondary: '#C4B5FD' },  // Purple
    speaking: { primary: '#EC4899', secondary: '#F9A8D4' },   // Pink
    idle: { primary: '#6B7280', secondary: '#9CA3AF' },       // Gray
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const color = colors[variant];
      const barCount = 64;
      const barWidth = width / barCount;
      const centerY = height / 2;

      if (isActive) {
        const waveformData = getWaveformData();
        
        for (let i = 0; i < barCount; i++) {
          let amplitude: number;
          
          if (waveformData) {
            const dataIndex = Math.floor(i * waveformData.length / barCount);
            amplitude = (waveformData[dataIndex] - 128) / 128;
          } else {
            // Simulated wave when no real data
            amplitude = Math.sin(Date.now() / 200 + i * 0.3) * 0.5;
          }

          const barHeight = Math.abs(amplitude) * height * 0.7 + 4;
          
          // Gradient bar
          const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
          gradient.addColorStop(0, color.secondary);
          gradient.addColorStop(0.5, color.primary);
          gradient.addColorStop(1, color.secondary);
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(
            i * barWidth + 1,
            centerY - barHeight / 2,
            barWidth - 2,
            barHeight,
            2
          );
          ctx.fill();
        }
      } else {
        // Idle state - subtle breathing animation
        for (let i = 0; i < barCount; i++) {
          const amplitude = Math.sin(Date.now() / 1000 + i * 0.1) * 0.1 + 0.1;
          const barHeight = amplitude * height * 0.3 + 2;
          
          ctx.fillStyle = color.secondary + '60';
          ctx.beginPath();
          ctx.roundRect(
            i * barWidth + 1,
            centerY - barHeight / 2,
            barWidth - 2,
            barHeight,
            2
          );
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, variant, getWaveformData]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={120}
      className="w-full max-w-md h-24 rounded-lg"
    />
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const VoiceTherapyPage: React.FC = () => {
  // Auth & Mental Health Context
  const { getDASS21Results } = useAuth();
  const [dass21Results, setDASS21Results] = useState<any>(null);

  // Voice state
  const [selectedVoice, setSelectedVoice] = useState<PiperVoice | undefined>(undefined);
  const [speed, setSpeed] = useState(0.9);
  const [showSettings, setShowSettings] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  
  // Conversation state
  const [conversation, setConversation] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // WebLLM state
  const [llmLoaded, setLlmLoaded] = useState(false);

  // Voice hook
  const {
    isListening,
    isSpeaking,
    isTranscribing,
    isLoading,
    isReady,
    sttLoaded,
    loadProgress,
    error,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    setVoice,
    currentVoice,
    availableVoices,
    getWaveformData,
  } = useVoice({
    autoInitialize: true,
    voice: selectedVoice,
  });

  // Check WebLLM state
  useEffect(() => {
    const checkLLM = () => {
      setLlmLoaded(webllmService.isModelLoaded());
    };
    checkLLM();
    // Check periodically since webllmService doesn't have subscribe
    const interval = setInterval(checkLLM, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load DASS-21 results
  useEffect(() => {
    const loadResults = async () => {
      const results = await getDASS21Results();
      setDASS21Results(results);
    };
    loadResults();
  }, [getDASS21Results]);

  // Handle voice change
  const handleVoiceChange = (voiceId: string) => {
    const voice = availableVoices.find(v => v.id === voiceId);
    if (voice) {
      setSelectedVoice(voice);
      setVoice(voice);
    }
  };

  // Process user speech and get AI response
  const processUserSpeech = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    setIsProcessing(true);
    
    // Add user message
    setConversation(prev => [...prev, { role: 'user', text: userText }]);

    try {
      // Build context with mental health awareness
      let systemPrompt = mentalHealthPromptService.generateSystemPrompt(dass21Results);
      systemPrompt += `\n\nIMPORTANT: Keep responses SHORT (2-3 sentences max). 
      Speak in a calm, soothing, ASMR-like tone. 
      Be warm and comforting. Use gentle language.`;

      // Generate AI response using webllmService async generator
      let aiResponse = '';
      const generator = webllmService.generateResponse(
        [{ role: 'user', content: userText }],
        { maxTokens: 100, temperature: 0.7, topP: 0.9 },
        systemPrompt
      );

      for await (const token of generator) {
        aiResponse += token;
      }

      // Clean up response
      aiResponse = aiResponse.trim();
      
      // Add AI message
      setConversation(prev => [...prev, { role: 'ai', text: aiResponse }]);

      // Speak the response
      await speak(aiResponse);

      // If continuous mode, start listening again after speaking
      if (continuousMode && !isSpeaking) {
        setTimeout(() => startListening(), 500);
      }

    } catch (err) {
      console.error('Error processing speech:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [speak, dass21Results, continuousMode, isSpeaking, startListening]);

  // Handle push-to-talk
  const handlePushToTalk = async () => {
    if (isListening) {
      const finalTranscript = await stopListening();
      if (finalTranscript.trim()) {
        processUserSpeech(finalTranscript);
      }
    } else if (!isSpeaking && !isProcessing && !isTranscribing) {
      await startListening();
    }
  };

  // Handle stop everything
  const handleStop = async () => {
    await stopListening();
    stopSpeaking();
    setIsProcessing(false);
  };

  // Determine visualizer variant
  const getVisualizerVariant = (): 'listening' | 'speaking' | 'idle' => {
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    return 'idle';
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 text-white">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Moon className="h-8 w-8 text-purple-400" />
            <h1 className="text-3xl font-light tracking-wide">Voice Therapy</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Speak with your AI companion in a calm, soothing environment
          </p>
          
          {/* Status badges */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {!llmLoaded && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Load a model in Chat first
              </Badge>
            )}
            {dass21Results && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                <Heart className="h-3 w-3 mr-1" />
                Personalized
              </Badge>
            )}
            {sttLoaded && (
              <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                <Mic className="h-3 w-3 mr-1" />
                Whisper Ready
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Main interaction area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-xl overflow-hidden">
            <CardContent className="p-8">
              {/* Audio Visualizer */}
              <div className="flex justify-center mb-8">
                <AudioVisualizer
                  isActive={isListening || isSpeaking}
                  getWaveformData={getWaveformData}
                  variant={getVisualizerVariant()}
                />
              </div>

              {/* Status text */}
              <div className="text-center mb-8">
                <AnimatePresence mode="wait">
                  {isListening && (
                    <motion.div
                      key="listening"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-purple-400"
                    >
                      <Waves className="h-5 w-5 mx-auto mb-2 animate-pulse" />
                      <p className="text-lg font-light">Listening...</p>
                      {transcript && (
                        <p className="text-sm text-slate-400 mt-2 italic">"{transcript}"</p>
                      )}
                    </motion.div>
                  )}
                  {isTranscribing && (
                    <motion.div
                      key="transcribing"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-indigo-400"
                    >
                      <Sparkles className="h-5 w-5 mx-auto mb-2 animate-spin" />
                      <p className="text-lg font-light">Transcribing...</p>
                    </motion.div>
                  )}
                  {isSpeaking && (
                    <motion.div
                      key="speaking"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-pink-400"
                    >
                      <Volume2 className="h-5 w-5 mx-auto mb-2 animate-pulse" />
                      <p className="text-lg font-light">Speaking...</p>
                    </motion.div>
                  )}
                  {isProcessing && !isSpeaking && !isTranscribing && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-indigo-400"
                    >
                      <Sparkles className="h-5 w-5 mx-auto mb-2 animate-spin" />
                      <p className="text-lg font-light">Thinking...</p>
                    </motion.div>
                  )}
                  {!isListening && !isSpeaking && !isProcessing && !isTranscribing && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-slate-400"
                    >
                      <p className="text-lg font-light">
                        {isLoading 
                          ? `Loading Whisper... ${loadProgress}%` 
                          : isReady 
                            ? 'Press and hold to speak'
                            : 'Initializing voice...'}
                      </p>
                      {isLoading && (
                        <div className="w-48 h-1 bg-slate-700 rounded-full mx-auto mt-3 overflow-hidden">
                          <motion.div 
                            className="h-full bg-purple-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${loadProgress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Main button */}
              <div className="flex justify-center mb-6">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onMouseDown={handlePushToTalk}
                  onMouseUp={async () => {
                    if (isListening) {
                      const finalTranscript = await stopListening();
                      if (finalTranscript.trim()) {
                        processUserSpeech(finalTranscript);
                      }
                    }
                  }}
                  onTouchStart={handlePushToTalk}
                  onTouchEnd={async () => {
                    if (isListening) {
                      const finalTranscript = await stopListening();
                      if (finalTranscript.trim()) {
                        processUserSpeech(finalTranscript);
                      }
                    }
                  }}
                  disabled={!llmLoaded || isProcessing || isSpeaking || isLoading || isTranscribing}
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
                    "shadow-lg shadow-purple-500/20",
                    isListening 
                      ? "bg-purple-500 scale-110" 
                      : isSpeaking
                        ? "bg-pink-500"
                        : isLoading || isTranscribing
                          ? "bg-indigo-600"
                          : "bg-slate-700 hover:bg-slate-600",
                    (!llmLoaded || isProcessing || isLoading) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-10 w-10 text-white animate-spin" />
                  ) : isTranscribing ? (
                    <Sparkles className="h-10 w-10 text-white animate-pulse" />
                  ) : isListening ? (
                    <Mic className="h-10 w-10 text-white" />
                  ) : isSpeaking ? (
                    <Volume2 className="h-10 w-10 text-white animate-pulse" />
                  ) : (
                    <MicOff className="h-10 w-10 text-slate-400" />
                  )}
                </motion.button>
              </div>

              {/* Stop button */}
              {(isListening || isSpeaking || isProcessing || isTranscribing) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStop}
                    className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                  >
                    <VolumeX className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Conversation history */}
        {conversation.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 space-y-3"
          >
            <h3 className="text-sm font-medium text-slate-400 mb-3">Recent</h3>
            {conversation.slice(-4).map((msg, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "p-3 rounded-lg text-sm",
                  msg.role === 'user'
                    ? "bg-purple-500/10 border border-purple-500/20 ml-8"
                    : "bg-pink-500/10 border border-pink-500/20 mr-8"
                )}
              >
                <p className={cn(
                  "text-xs mb-1",
                  msg.role === 'user' ? "text-purple-400" : "text-pink-400"
                )}>
                  {msg.role === 'user' ? 'You' : 'AI Companion'}
                </p>
                <p className="text-slate-300">{msg.text}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="text-slate-400 hover:text-white"
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Voice Settings
          </Button>

          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <Card className="bg-slate-800/30 border-slate-700/30">
                  <CardContent className="p-6 space-y-6">
                    {/* Voice selection */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Voice</Label>
                      <Select value={currentVoice?.id || 'amy'} onValueChange={handleVoiceChange}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableVoices.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              <div>
                                <span className="font-medium">{voice.name}</span>
                                <span className="text-xs text-slate-400 ml-2">{voice.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Speed slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300">Speed</Label>
                        <span className="text-xs text-slate-400">{speed.toFixed(1)}x</span>
                      </div>
                      <Slider
                        value={[speed]}
                        onValueChange={([value]) => setSpeed(value)}
                        min={0.5}
                        max={1.5}
                        step={0.1}
                        className="py-2"
                      />
                    </div>

                    {/* Continuous mode */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-slate-300">Continuous Mode</Label>
                        <p className="text-xs text-slate-500">Auto-listen after AI responds</p>
                      </div>
                      <Switch
                        checked={continuousMode}
                        onCheckedChange={setContinuousMode}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex items-start gap-2 p-3 bg-slate-700/30 rounded-lg">
                      <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-400">
                        Voice model downloads once (~20MB) and runs locally for privacy. 
                        No data leaves your device.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Error display */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
          >
            <p className="text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VoiceTherapyPage;
