import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  Brain, 
  Zap, 
  CheckCircle, 
  Circle,
  Loader2 
} from "lucide-react";
import { webllmService } from "@/services/webllm-service";

interface Model {
  id: string;
  name: string;
  description: string;
  type: "cloud" | "local";
  size?: string;
  speed: "fast" | "medium" | "slow";
  quality: "high" | "medium" | "low";
  isAvailable?: boolean;
  isLoading?: boolean;
}

interface ModelSelectorProps {
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  isLoading?: boolean;
  onOpenSidebar?: () => void; // Add callback to open sidebar
}

const AVAILABLE_MODELS: Model[] = [
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    description: "Fast and efficient local model",
    type: "local",
    size: "1.8GB",
    speed: "fast",
    quality: "high",
    isAvailable: true,
  },
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    description: "Ultra-lightweight local model",
    type: "local",
    size: "0.9GB",
    speed: "fast",
    quality: "medium",
    isAvailable: true,
  },
  {
    id: "phi-3-mini",
    name: "Phi-3 Mini",
    description: "Compact and efficient model",
    type: "local",
    size: "2.1GB",
    speed: "medium",
    quality: "high",
    isAvailable: true,
  },
  {
    id: "gemma-2b",
    name: "Gemma 2B",
    description: "Google's lightweight model",
    type: "local",
    size: "1.4GB",
    speed: "fast",
    quality: "medium",
    isAvailable: true,
  },
  {
    id: "qwen-1.5-0.5b",
    name: "Qwen 1.5 0.5B",
    description: "Very fast, minimal resource usage",
    type: "local",
    size: "0.4GB",
    speed: "fast",
    quality: "low",
    isAvailable: true,
  },
];

export function ModelSelector({ 
  selectedModel, 
  onModelSelect, 
  isLoading = false,
  onOpenSidebar
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  
  // Update cached models list periodically or on events
  useEffect(() => {
    const updateCachedModels = async () => {
      try {
        // Use async method to get actual cached models
        const cached = await webllmService.getCachedModelsAsync();
        console.log('ModelSelector: fetched cached models:', cached);
        setCachedModels(cached);
        
        // Update active model
        const current = webllmService.getActiveModel();
        setActiveModel(current);
        console.log('ModelSelector: Active model is:', current);
      } catch (error) {
        console.error('Error fetching cached models:', error);
        // Fallback to sync method
        const cached = webllmService.getCachedModels();
        setCachedModels(cached);
        const current = webllmService.getActiveModel();
        setActiveModel(current);
      }
    };
    
    // Initial load
    updateCachedModels();
    
    // TEST: Add a test model for debugging (remove this after testing)
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        console.log('Adding test model for debugging...');
        webllmService.addTestModel();
        updateCachedModels();
      }, 1000);
    }
    
    // Check for updates every 3 seconds
    const interval = setInterval(updateCachedModels, 3000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Get only downloaded/cached models
  const availableModels = AVAILABLE_MODELS.filter(model => cachedModels.includes(model.id));
  
  // Current model is the active model if it exists, otherwise first available
  const currentModel = activeModel 
    ? availableModels.find(m => m.id === activeModel) 
    : availableModels.find(m => m.id === selectedModel) || availableModels[0];

  // Handle model selection
  const handleModelSelect = async (modelId: string) => {
    console.log('Model selected:', modelId);
    onModelSelect(modelId);
    setIsOpen(false); // Close dropdown
    
    // Try to load the model immediately if it's cached
    if (cachedModels.includes(modelId)) {
      try {
        const success = await webllmService.loadModel(modelId);
        if (success) {
          webllmService.setActiveModel(modelId);
          setActiveModel(modelId);
          console.log(`Model ${modelId} loaded and activated`);
        }
      } catch (error) {
        console.error('Failed to load model:', error);
      }
    }
  };

  // Auto-start the model when selected
  useEffect(() => {
    if (selectedModel && cachedModels.includes(selectedModel) && selectedModel !== activeModel) {
      // Auto-load the selected model if it's cached and not already active
      handleModelSelect(selectedModel);
    }
  }, [selectedModel, cachedModels, activeModel]);

  const getSpeedColor = (speed: string) => {
    switch (speed) {
      case "fast": return "text-green-400";
      case "medium": return "text-yellow-400";
      case "slow": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "high": return "text-purple-400";
      case "medium": return "text-blue-400";
      case "low": return "text-gray-400";
      default: return "text-gray-400";
    }
  };

  // If no models are downloaded, show a prompt to download
  if (availableModels.length === 0) {
    return (
      <Button
        variant="ghost"
        className="flex items-center space-x-2 h-10 px-3 rounded-lg hover:bg-gray-800 text-gray-300 border border-gray-700 min-w-[160px]"
        onClick={onOpenSidebar}
      >
        <Brain className="h-4 w-4 text-purple-400" />
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-white">Download Model</span>
          <span className="text-xs text-gray-400">Click to browse</span>
        </div>
      </Button>
    );
  }

    return (
      <div className="relative">
        <Button
          variant="ghost"
          className="flex items-center space-x-2 h-10 px-3 rounded-lg hover:bg-gray-800 text-gray-300 border border-gray-700 min-w-[160px]"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center space-x-2 flex-1">
            <Brain className="h-4 w-4 text-purple-400" />
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-white">{currentModel?.name || "No Model"}</span>
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-400">{currentModel?.size || ""}</span>
                {currentModel && (
                  <>
                    <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-green-400">Ready</span>
                  </>
                )}
              </div>
            </div>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-2 right-0 z-50 w-80"
            >
              <Card className="p-4 bg-gray-800 border-gray-700 shadow-2xl">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center space-x-2">
                    <Brain className="h-4 w-4 text-purple-400" />
                    <span>Local AI Models</span>
                  </h3>
                  
                  {availableModels.map((model) => (
                    <motion.button
                      key={model.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleModelSelect(model.id)}
                      className={`w-full p-3 rounded-lg border transition-all text-left ${
                        selectedModel === model.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <Brain className="h-4 w-4 text-purple-400" />
                            <span className="font-medium text-gray-200">
                              {model.name}
                            </span>
                            {selectedModel === model.id && (
                              <CheckCircle className="h-4 w-4 text-purple-400" />
                            )}
                          </div>
                          
                          <p className="text-xs text-gray-400 mb-2">
                            {model.description}
                          </p>
                          
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                              <Zap className={`h-3 w-3 ${getSpeedColor(model.speed)}`} />
                              <span className="text-xs text-gray-400 capitalize">
                                {model.speed}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              <Circle className={`h-3 w-3 ${getQualityColor(model.quality)}`} />
                              <span className="text-xs text-gray-400 capitalize">
                                {model.quality}
                              </span>
                            </div>
                            
                            <Badge variant="secondary" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700">
                              {model.size}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
