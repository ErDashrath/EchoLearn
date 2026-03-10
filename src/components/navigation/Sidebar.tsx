import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  X, 
  Brain, 
  Download, 
  Loader2, 
  Settings, 
  Volume2, 
  VolumeX,
  FileText,
  FileCode,
  Database,
  BarChart3,
  Mic,
  CheckCircle,
  Circle,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Save,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { TTSToggle } from "@/components/TTSToggle";
import { webllmService, type WebLLMModel } from "@/services/webllm-service";
import type { ChatMode, FocusMode } from "@/types/schema";
import type { ChatSession } from "@/services/chat-memory-service";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ChatMode;
  focus: FocusMode;
  onModeChange: (mode: ChatMode) => void;
  onFocusChange: (focus: FocusMode) => void;
  onExportChat: (format: 'txt' | 'md' | 'json') => void;
  ttsEnabled: boolean;
  onTTSToggle: (enabled: boolean) => void;
  stats?: {
    messagesSent: number;
    grammarImprovements: number;
    speakingTime: string;
  };
  // WebLLM props
  selectedModel?: string;
  onModelSelect?: (modelId: string) => void;
  // Chat History props
  sessions?: ChatSession[];
  currentSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
  onDeleteSession?: (sessionId: string) => void;
  sessionsLoading?: boolean;
  // System Prompt props
  customSystemPrompt?: string;
  isCustomPromptEnabled?: boolean;
  onSystemPromptChange?: (prompt: string, isEnabled: boolean) => void;
}

export function Sidebar({
  isOpen,
  onClose,
  mode,
  focus,
  onModeChange,
  onFocusChange,
  onExportChat,
  ttsEnabled,
  onTTSToggle,
  stats = {
    messagesSent: 0,
    grammarImprovements: 0,
    speakingTime: "0 min"
  },
  selectedModel: _selectedModel,
  onModelSelect,
  // Chat History props
  sessions = [],
  currentSessionId = null,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  sessionsLoading = false,
  // System Prompt props
  customSystemPrompt: initialCustomPrompt = "",
  isCustomPromptEnabled: initialCustomEnabled = false,
  onSystemPromptChange
}: SidebarProps) {
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ progress: number; text: string } | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("us");
  const [selectedLevel, setSelectedLevel] = useState("intermediate");
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  
  // System prompt state
  const [customPrompt, setCustomPrompt] = useState(initialCustomPrompt);
  const [isPromptEnabled, setIsPromptEnabled] = useState(initialCustomEnabled);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  const availableModels = webllmService.getAvailableModels();

  // Update cached models and active model state
  useEffect(() => {
    const updateModels = async () => {
      try {
        const cached = await webllmService.getCachedModelsAsync();
        setCachedModels(cached);
        
        // Only update active model if it's not currently null (deactivated)
        const currentActive = webllmService.getActiveModel();
        setActiveModel(currentActive);
      } catch (error) {
        console.error('Error updating models:', error);
        const cached = webllmService.getCachedModels();
        setCachedModels(cached);
        
        // Fallback with same logic - respect deactivated state
        const currentActive = webllmService.getActiveModel();
        setActiveModel(currentActive);
      }
    };

    updateModels();
    // Reduce frequency to avoid conflicts with user actions
    const interval = setInterval(updateModels, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleModelDownload = async (model: WebLLMModel) => {
    if (downloadingModel) return;

    setDownloadingModel(model.id);
    setDownloadProgress({ progress: 0, text: 'Preparing...' });

    webllmService.setProgressCallback((progress) => {
      setDownloadProgress(progress);
    });

    try {
      const success = await webllmService.loadModel(model.id);
      if (success) {
        setActiveModel(model.id);
        if (onModelSelect) {
          onModelSelect(model.id);
        }
      }
    } finally {
      setDownloadingModel(null);
      setDownloadProgress(null);
      webllmService.clearProgressCallback();
    }
  };

  const handleModelSelect = async (modelId: string) => {
    if (activeModel === modelId) {
      // Deactivate current model
      await webllmService.deactivateModel();
      setActiveModel(null);
      return;
    }

    try {
      const success = await webllmService.loadModel(modelId);
      if (success) {
        // Set active model in the service
        webllmService.setActiveModel(modelId);
        setActiveModel(modelId);
        if (onModelSelect) {
          onModelSelect(modelId);
        }
      }
    } catch (error) {
      console.error('Failed to activate model:', error);
    }
  };

  // Chat History helpers
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getSessionPreview = (session: ChatSession): string => {
    if (session.messages.length === 0) return 'New conversation';
    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      return lastUserMsg.content.length > 50 
        ? lastUserMsg.content.substring(0, 50) + '...'
        : lastUserMsg.content;
    }
    return 'Conversation started';
  };

  // System Prompt handlers
  const handleSavePrompt = async () => {
    if (!customPrompt.trim()) return;
    setIsSavingPrompt(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    onSystemPromptChange?.(customPrompt, true);
    setIsSavingPrompt(false);
  };

  const handleResetPrompt = () => {
    setCustomPrompt("");
    setIsPromptEnabled(false);
    onSystemPromptChange?.("", false);
  };

  const handlePromptToggle = (enabled: boolean) => {
    setIsPromptEnabled(enabled);
    if (!enabled) {
      onSystemPromptChange?.("", false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed left-0 top-0 z-[60] h-full w-80">
          {/* Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 20 }}
            className="relative w-80 bg-dark-bg shadow-2xl border-r border-dark-border flex flex-col h-full z-10"
            style={{ boxShadow: '2px 0 15px rgba(0, 0, 0, 0.2)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-border">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Brain className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-dark-text">
                  AI Control Panel
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg-secondary"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scroll-hidden scroll-smooth p-4 space-y-6 bg-dark-bg">
              
              {/* WebLLM - Main Feature */}
              <Card className="border-dark-border bg-dark-bg-secondary/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Brain className="h-5 w-5 text-blue-400" />
                    Local AI Models
                    <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 border-blue-700">
                      Featured
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-gray-400">
                    Run AI models locally in your browser. Private, fast, and offline-capable.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Download Progress */}
                  {downloadProgress && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {downloadProgress.text}
                        </span>
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          {Math.round(downloadProgress.progress * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-100 dark:bg-blue-800 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${downloadProgress.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Available Models */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-gray-200">
                      <Download className="h-4 w-4" />
                      Available Models
                    </h4>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto scroll-hidden scroll-smooth">
                      {availableModels.map((model) => {
                        const isCached = cachedModels.includes(model.id);
                        const isDownloading = downloadingModel === model.id;
                        const isActive = activeModel === model.id;
                        
                        return (
                          <motion.div
                            key={model.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`p-3 rounded-lg border transition-all cursor-pointer ${
                              isActive 
                                ? 'border-purple-500 bg-purple-500/10' 
                                : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Brain className="h-4 w-4 text-purple-400" />
                                  <span className="font-medium text-gray-200">
                                    {model.name}
                                  </span>
                                  {isActive && (
                                    <CheckCircle className="h-4 w-4 text-purple-400" />
                                  )}
                                </div>
                                
                                <p className="text-xs text-gray-400 mb-2">
                                  {model.description}
                                </p>
                                
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center space-x-1">
                                    <Circle className="h-3 w-3 text-green-400" />
                                    <span className="text-xs text-gray-400">Fast</span>
                                  </div>
                                  
                                  <div className="flex items-center space-x-1">
                                    <Circle className="h-3 w-3 text-purple-400" />
                                    <span className="text-xs text-gray-400">High Quality</span>
                                  </div>
                                  
                                  <Badge variant="secondary" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700">
                                    {model.size}
                                  </Badge>
                                  
                                  {isCached && (
                                    <span className="text-xs text-green-400 font-medium">
                                      Downloaded
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="ml-3 flex gap-2">
                                {isCached ? (
                                  <Button
                                    variant={isActive ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleModelSelect(model.id)}
                                    disabled={isDownloading}
                                    className={`h-8 text-xs ${
                                      isActive 
                                        ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                    }`}
                                  >
                                    {isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleModelDownload(model)}
                                    disabled={isDownloading || !!downloadingModel}
                                    className="h-8 border-gray-600 text-gray-300 hover:bg-gray-700"
                                  >
                                    {isDownloading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Download className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    {cachedModels.length > 0 && (
                      <div className="pt-3 border-t border-gray-700">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('Clear all downloaded models? This will free up storage space.')) {
                              webllmService.clearModelCache();
                              window.location.reload();
                            }
                          }}
                          className="w-full text-red-400 hover:text-red-300 border-gray-700 hover:bg-gray-700"
                        >
                          Clear All Models ({cachedModels.length})
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Chat History */}
              <Card className="border-gray-800 bg-gray-800/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <MessageSquare className="h-5 w-5 text-emerald-400" />
                    Chat History
                    {sessions.length > 0 && (
                      <Badge variant="secondary" className="bg-emerald-900/30 text-emerald-300 border-emerald-700">
                        {sessions.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* New Chat Button */}
                  <Button
                    onClick={onNewSession}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New Chat
                  </Button>

                  {/* Session List */}
                  <div className="max-h-64 overflow-y-auto scroll-hidden space-y-2">
                    {sessionsLoading ? (
                      <div className="text-center py-4 text-gray-500">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading sessions...
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No chat history yet</p>
                      </div>
                    ) : (
                      sessions.slice(0, 10).map((session) => (
                        <motion.div
                          key={session.id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className={`
                            group relative p-2 rounded-lg cursor-pointer transition-colors
                            ${currentSessionId === session.id
                              ? 'bg-emerald-900/30 border border-emerald-700'
                              : 'hover:bg-gray-700 border border-transparent'
                            }
                          `}
                          onClick={() => onSelectSession?.(session.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-white text-sm truncate">
                                {session.title}
                              </h4>
                              <p className="text-xs text-gray-400 truncate mt-0.5">
                                {getSessionPreview(session)}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                <Clock className="h-3 w-3" />
                                {formatDate(session.updatedAt)}
                                <span>•</span>
                                <MessageSquare className="h-3 w-3" />
                                {session.messages.length}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession?.(session.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                  
                  {sessions.length > 10 && (
                    <p className="text-xs text-gray-500 text-center">
                      Showing 10 of {sessions.length} conversations
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Chat Settings */}
              <Card className="border-gray-800 bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Settings className="h-4 w-4" />
                    Chat Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-200">Mode</label>
                    <Select value={mode} onValueChange={(value: ChatMode) => onModeChange(value)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="conversation" className="text-gray-200 hover:bg-gray-700">Conversation</SelectItem>
                        <SelectItem value="interview" className="text-gray-200 hover:bg-gray-700">Interview</SelectItem>
                        <SelectItem value="roleplay" className="text-gray-200 hover:bg-gray-700">Roleplay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-200">Focus</label>
                    <Select value={focus} onValueChange={(value: FocusMode) => onFocusChange(value)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="fluency" className="text-gray-200 hover:bg-gray-700">Fluency</SelectItem>
                        <SelectItem value="correction" className="text-gray-200 hover:bg-gray-700">Correction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Separator className="bg-gray-700" />
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ttsEnabled ? (
                          <Volume2 className="h-4 w-4 text-blue-400" />
                        ) : (
                          <VolumeX className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="text-sm font-medium text-gray-200">Voice Output</span>
                      </div>
                      <TTSToggle enabled={ttsEnabled} onToggle={onTTSToggle} />
                    </div>
                  </div>

                  <Separator className="bg-gray-700" />

                  {/* System Prompt Settings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-medium text-gray-200">System Prompt</span>
                        {isPromptEnabled && customPrompt.trim() && (
                          <Badge variant="secondary" className="text-xs bg-amber-900/30 text-amber-300 border-amber-700">
                            Custom
                          </Badge>
                        )}
                      </div>
                      <Switch
                        checked={isPromptEnabled}
                        onCheckedChange={handlePromptToggle}
                        className="data-[state=checked]:bg-amber-500"
                      />
                    </div>

                    <AnimatePresence>
                      {isPromptEnabled && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-3 overflow-hidden"
                        >
                          <Textarea
                            placeholder="e.g., 'You are a supportive therapist who specializes in anxiety management. Be warm, empathetic, and provide practical coping strategies.'"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            className="min-h-[100px] text-sm bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500 resize-none"
                            maxLength={1000}
                          />
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>{customPrompt.length}/1000</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleResetPrompt}
                              className="flex-1 h-8 text-xs border-gray-700 text-gray-300 hover:bg-gray-700"
                              disabled={!customPrompt && !isPromptEnabled}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSavePrompt}
                              className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700"
                              disabled={!customPrompt.trim() || isSavingPrompt}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {isSavingPrompt ? "Saving..." : "Apply"}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>

              {/* Language Settings */}
              <Card className="border-gray-800 bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Mic className="h-4 w-4" />
                    Language Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-200">Accent Preference</label>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="us" className="text-gray-200 hover:bg-gray-700">American English</SelectItem>
                        <SelectItem value="uk" className="text-gray-200 hover:bg-gray-700">British English</SelectItem>
                        <SelectItem value="au" className="text-gray-200 hover:bg-gray-700">Australian English</SelectItem>
                        <SelectItem value="ca" className="text-gray-200 hover:bg-gray-700">Canadian English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-200">Difficulty Level</label>
                    <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="beginner" className="text-gray-200 hover:bg-gray-700">Beginner</SelectItem>
                        <SelectItem value="intermediate" className="text-gray-200 hover:bg-gray-700">Intermediate</SelectItem>
                        <SelectItem value="advanced" className="text-gray-200 hover:bg-gray-700">Advanced</SelectItem>
                        <SelectItem value="native" className="text-gray-200 hover:bg-gray-700">Native-like</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Learning Progress */}
              <Card className="border-gray-800 bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <BarChart3 className="h-4 w-4" />
                    Learning Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Messages sent</span>
                    <span className="text-sm font-medium text-gray-200">{stats.messagesSent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Grammar improvements</span>
                    <span className="text-sm font-medium text-emerald-400">{stats.grammarImprovements}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Speaking time</span>
                    <span className="text-sm font-medium text-blue-400">{stats.speakingTime}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Export Options */}
              <Card className="border-gray-800 bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="text-base text-white">Export Chat</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                    onClick={() => onExportChat('txt')}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export as Text
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                    onClick={() => onExportChat('md')}
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Export as Markdown
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                    onClick={() => onExportChat('json')}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Export as JSON
                  </Button>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
