import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
  Circle
} from "lucide-react";
import { TTSToggle } from "@/components/TTSToggle";
import { webllmService, type WebLLMModel } from "@/services/webllm-service";
import type { ChatMode, FocusMode } from "@/types/schema";

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
  onModelSelect
}: SidebarProps) {
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ progress: number; text: string } | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("us");
  const [selectedLevel, setSelectedLevel] = useState("intermediate");
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex">
          {/* Backdrop - Only covers sidebar area */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-0 top-0 w-80 h-full bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 20 }}
            className="relative w-80 bg-gray-900 shadow-2xl border-r border-gray-800 flex flex-col h-full z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Brain className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  AI Control Panel
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scroll-hidden scroll-smooth p-4 space-y-6 bg-gray-900">
              
              {/* WebLLM - Main Feature */}
              <Card className="border-gray-800 bg-gray-800/50">
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
