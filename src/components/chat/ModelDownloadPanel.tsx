import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Brain, 
  Download, 
  Loader2, 
  CheckCircle,
  Trash2,
  Sparkles,
  Zap,
  HardDrive
} from "lucide-react";
import { webllmService, type WebLLMModel } from "@/services/webllm-service";

interface ModelDownloadPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel?: string;
  onModelSelect?: (modelId: string) => void;
}

export function ModelDownloadPanel({
  isOpen,
  onClose,
  onModelSelect
}: ModelDownloadPanelProps) {
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ progress: number; text: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<WebLLMModel[]>([]);
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      const models = webllmService.getAvailableModels();
      setAvailableModels(models);
      
      try {
        const cached = await webllmService.getCachedModelsAsync();
        setCachedModels(cached);
      } catch {
        setCachedModels(webllmService.getCachedModels());
      }
      
      setActiveModel(webllmService.getActiveModel());
    };
    
    loadModels();
    
    // Refresh every 2 seconds
    const interval = setInterval(loadModels, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleModelDownload = async (model: WebLLMModel) => {
    if (downloadingModel) return;

    setDownloadingModel(model.id);
    setDownloadProgress({ progress: 0, text: 'Preparing download...' });

    webllmService.setProgressCallback((progress) => {
      setDownloadProgress(progress);
    });

    try {
      const success = await webllmService.loadModel(model.id);
      if (success) {
        setCachedModels(prev => [...prev, model.id]);
        onModelSelect?.(model.id);
        setActiveModel(model.id);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingModel(null);
      setDownloadProgress(null);
      webllmService.clearProgressCallback();
    }
  };

  const handleModelSelect = async (modelId: string) => {
    try {
      const success = await webllmService.loadModel(modelId);
      if (success) {
        webllmService.setActiveModel(modelId);
        setActiveModel(modelId);
        onModelSelect?.(modelId);
      }
    } catch (error) {
      console.error('Failed to activate model:', error);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Clear all downloaded models? This will free up storage space.')) {
      webllmService.clearModelCache();
      setCachedModels([]);
      setActiveModel(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Panel - RIGHT SIDE */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="ml-auto w-96 bg-gray-900 shadow-2xl border-l border-gray-700 flex flex-col relative z-10 h-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-blue-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">AI Models</h2>
                  <p className="text-xs text-gray-400">Download & manage local models</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Info Banner */}
              <div className="p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl border border-blue-700/30">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">100% Private AI</h3>
                    <p className="text-xs text-gray-400">
                      Models run locally in your browser. No data sent to servers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Download Progress */}
              {downloadProgress && (
                <Card className="border-blue-500/50 bg-blue-900/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        <span className="text-sm font-medium text-white">
                          {downloadProgress.text}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-blue-400">
                        {Math.round(downloadProgress.progress * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3">
                      <motion.div 
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${downloadProgress.progress * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Models List */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Available Models ({availableModels.length})
                </h3>

                {availableModels.map((model) => {
                  const isCached = cachedModels.includes(model.id);
                  const isDownloading = downloadingModel === model.id;
                  const isActive = activeModel === model.id;

                  return (
                    <motion.div
                      key={model.id}
                      whileHover={{ scale: 1.01 }}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive 
                          ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20' 
                          : isCached
                          ? 'border-green-500/30 bg-green-900/10'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className={`h-4 w-4 ${isActive ? 'text-purple-400' : 'text-gray-400'}`} />
                            <span className="font-semibold text-white">
                              {model.name}
                            </span>
                            {isActive && (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                                Active
                              </Badge>
                            )}
                            {isCached && !isActive && (
                              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                                Ready
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-xs text-gray-400 mb-3">
                            {model.description}
                          </p>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-gray-400">{model.size}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3 text-yellow-500" />
                              <span className="text-xs text-gray-400">{model.parameters}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          {isDownloading ? (
                            <Button
                              size="sm"
                              disabled
                              className="bg-blue-600 text-white"
                            >
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              Downloading
                            </Button>
                          ) : isCached ? (
                            <Button
                              size="sm"
                              onClick={() => handleModelSelect(model.id)}
                              className={isActive 
                                ? "bg-purple-600 hover:bg-purple-700 text-white" 
                                : "bg-green-600 hover:bg-green-700 text-white"
                              }
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {isActive ? 'Active' : 'Use'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleModelDownload(model)}
                              disabled={!!downloadingModel}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Clear Cache Button */}
              {cachedModels.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleClearCache}
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Downloaded Models
                </Button>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 bg-gray-800/50">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{cachedModels.length} model(s) downloaded</span>
                <span>WebLLM Powered</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
