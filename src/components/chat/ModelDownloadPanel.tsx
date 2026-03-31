import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Brain, 
  Download, 
  Loader2, 
  Trash2,
  Sparkles
} from "lucide-react";
import { webllmService, type WebLLMModel } from "@/services/webllm-service";
import { nativeCpuInferenceService } from "@/services/native-cpu-inference-service";
import { modelVariantService } from "@/services/model-variant-service";
import { useToast } from "@/hooks/use-toast";

interface ModelDownloadPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel?: string;
  onModelSelect?: (modelId: string) => void;
}

type CompanionTier = "small" | "medium" | "large";

type DecoratedCompanionModel = WebLLMModel & {
  companionName: string;
  personality: string;
  tier: CompanionTier;
  modelFamily: string;
};

interface DeviceSpecs {
  ramGB: number | null;
  cpuCores: number | null;
  hasGpu: boolean;
}

const COMPANION_NAMES = [
  "Aarav",
  "Mira",
  "Nia",
  "Reyansh",
  "Ira",
  "Vihaan",
  "Anaya",
  "Kabir",
  "Aditi",
  "Rohan",
];

const TIER_PERSONALITY: Record<CompanionTier, string> = {
  small: "Fast and lightweight for quick check-ins.",
  medium: "Balanced and versatile for everyday support.",
  large: "Deep and thoughtful for reflective conversations.",
};

function inferModelFamily(model: WebLLMModel): string {
  const source = `${model.name} ${model.id}`.toLowerCase();
  if (source.includes("llama")) return "LLaMA";
  if (source.includes("qwen")) return "Qwen";
  if (source.includes("phi")) return "Phi";
  if (source.includes("gemma")) return "Gemma";
  return "Local Model";
}

function inferTier(model: WebLLMModel): CompanionTier {
  if (model.sizeGB <= 1.0) return "small";
  if (model.sizeGB <= 2.4) return "medium";
  return "large";
}

function decorateModel(model: WebLLMModel, index: number): DecoratedCompanionModel {
  const tier = inferTier(model);
  return {
    ...model,
    tier,
    companionName: COMPANION_NAMES[index % COMPANION_NAMES.length],
    personality: TIER_PERSONALITY[tier],
    modelFamily: inferModelFamily(model),
  };
}

function pickRecommendedTier(specs: DeviceSpecs): CompanionTier {
  const ram = specs.ramGB ?? 8;
  const cpu = specs.cpuCores ?? 4;

  if (ram <= 8 || cpu <= 4) {
    return "small";
  }

  if (ram >= 16 && cpu >= 8 && specs.hasGpu) {
    return "large";
  }

  return "medium";
}

function pickRecommendedModelId(models: DecoratedCompanionModel[], specs: DeviceSpecs): string | null {
  if (!models.length) {
    return null;
  }

  const preferredTier = pickRecommendedTier(specs);
  const byTier = models.filter((model) => model.tier === preferredTier);

  if (preferredTier === "small") {
    const pool = byTier.length > 0 ? byTier : models;
    return [...pool].sort((left, right) => left.sizeGB - right.sizeGB)[0]?.id ?? null;
  }

  if (preferredTier === "large") {
    const pool = byTier.length > 0 ? byTier : models;
    return [...pool].sort((left, right) => right.sizeGB - left.sizeGB)[0]?.id ?? null;
  }

  const pool = byTier.length > 0 ? byTier : models;
  return [...pool]
    .sort((left, right) => {
      const leftDistance = Math.abs(left.sizeGB - 1.8);
      const rightDistance = Math.abs(right.sizeGB - 1.8);
      return leftDistance - rightDistance;
    })[0]?.id ?? null;
}

async function detectDeviceSpecs(): Promise<DeviceSpecs> {
  const nav = typeof navigator !== "undefined"
    ? (navigator as Navigator & { deviceMemory?: number })
    : null;

  const ramValue = nav && typeof nav.deviceMemory === "number"
    ? nav.deviceMemory
    : null;
  const cpuValue = typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
    ? navigator.hardwareConcurrency
    : null;

  let hasGpu = false;
  try {
    hasGpu = await nativeCpuInferenceService.hasNvidiaGpu();
  } catch {
    hasGpu = false;
  }

  return {
    ramGB: ramValue,
    cpuCores: cpuValue,
    hasGpu,
  };
}

function buildSystemSummary(specs: DeviceSpecs): string {
  const ram = specs.ramGB ? `${specs.ramGB}GB RAM` : "RAM unknown";
  const cpu = specs.cpuCores ? `${specs.cpuCores} CPU cores` : "CPU unknown";
  const gpu = specs.hasGpu ? "NVIDIA GPU detected" : "No NVIDIA GPU detected";
  return `${ram} • ${cpu} • ${gpu}`;
}

export function ModelDownloadPanel({
  isOpen,
  onClose,
  onModelSelect
}: ModelDownloadPanelProps) {
  const { toast } = useToast();
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ progress: number; text: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<WebLLMModel[]>([]);
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [deviceSpecs, setDeviceSpecs] = useState<DeviceSpecs>({ ramGB: null, cpuCores: null, hasGpu: false });
  const [isCancellingDownload, setIsCancellingDownload] = useState(false);
  const downloadCancellationRef = useRef<{ cancelled: boolean; modelId: string } | null>(null);

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

  useEffect(() => {
    let mounted = true;

    const updateSpecs = async () => {
      const specs = await detectDeviceSpecs();
      if (mounted) {
        setDeviceSpecs(specs);
      }
    };

    updateSpecs();
    return () => {
      mounted = false;
    };
  }, []);

  const handleModelDownload = async (model: WebLLMModel) => {
    if (downloadingModel) return;

    downloadCancellationRef.current = { cancelled: false, modelId: model.id };
    setIsCancellingDownload(false);
    setDownloadingModel(model.id);
    setDownloadProgress({ progress: 0, text: 'Preparing download...' });

    webllmService.setProgressCallback((progress) => {
      setDownloadProgress(progress);
    });

    try {
      const success = await webllmService.loadModel(model.id);
      const wasCancelled = downloadCancellationRef.current?.cancelled && downloadCancellationRef.current.modelId === model.id;
      if (wasCancelled) {
        toast({
          title: 'Download cancelled',
          description: 'Model download was cancelled before completion.',
        });
        return;
      }

      if (success) {
        webllmService.clearProgressCallback();

        if (downloadCancellationRef.current?.cancelled) {
          toast({
            title: 'Download cancelled',
            description: 'Model download was cancelled before activation.',
          });
          return;
        }

        const hasNvidiaGpu = await nativeCpuInferenceService.hasNvidiaGpu();
        const runtimeUrl = modelVariantService.getPreferredNativeRuntimeUrl(hasNvidiaGpu);
        if (runtimeUrl) {
          setDownloadProgress({
            progress: 0.92,
            text: hasNvidiaGpu
              ? 'Preparing native CUDA runtime...'
              : 'Preparing native CPU runtime...',
          });

          try {
            const runtimeResult = await nativeCpuInferenceService.downloadRuntimeFromUrl(runtimeUrl);
            if (runtimeResult?.runtimePath) {
              modelVariantService.setNativeRuntimePath(runtimeResult.runtimePath);
            }
          } catch (runtimeError) {
            console.warn('Native runtime download failed:', runtimeError);
            toast({
              title: 'Native runtime download failed',
              description: 'WebGPU model is ready. Native CPU runtime can be downloaded later.',
              variant: 'destructive',
            });
          }
        }

        if (model.native?.hfUrl) {
          setDownloadProgress({
            progress: 0.98,
            text: 'Finalizing native CPU model (GGUF)...',
          });

          try {
            const nativeResult = await nativeCpuInferenceService.downloadModelFromUrl(
              model.id,
              model.native.hfUrl,
            );

            if (nativeResult?.modelPath) {
              modelVariantService.setNativeModelPath(model.id, nativeResult.modelPath);
            }
          } catch (nativeError) {
            console.warn('Native model download failed:', nativeError);
            toast({
              title: 'Native model download failed',
              description: 'WebGPU model is ready. Native CPU variant can be downloaded later.',
              variant: 'destructive',
            });
          }
        }

        setCachedModels(prev => prev.includes(model.id) ? prev : [...prev, model.id]);
        onModelSelect?.(model.id);
        setActiveModel(model.id);
      }
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: 'Model download failed',
        description: error instanceof Error
          ? error.message
          : 'Unable to download model right now. Please retry.',
        variant: 'destructive',
      });
    } finally {
      downloadCancellationRef.current = null;
      setIsCancellingDownload(false);
      setDownloadingModel(null);
      setDownloadProgress(null);
      webllmService.clearProgressCallback();
    }
  };

  const handleCancelDownload = async () => {
    if (!downloadingModel || downloadingModel === '__clearing__' || isCancellingDownload) {
      return;
    }

    setIsCancellingDownload(true);
    downloadCancellationRef.current = {
      cancelled: true,
      modelId: downloadingModel,
    };
    setDownloadProgress((prev) => ({
      progress: prev?.progress ?? 0,
      text: 'Cancelling download...',
    }));

    await webllmService.cancelModelLoad();
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
      setDownloadingModel('__clearing__');
      setDownloadProgress({ progress: 0, text: 'Clearing downloaded model caches...' });

      try {
        await webllmService.clearModelCache();
        modelVariantService.clearNativePaths();
        await nativeCpuInferenceService.clearDownloads(true, true);

        setCachedModels([]);
        setActiveModel(null);

        toast({
          title: 'Model cache cleared',
          description: 'WebLLM and native model/runtime downloads were removed.',
        });
      } catch (error) {
        console.error('Failed to clear model cache:', error);
        toast({
          title: 'Failed to clear cache',
          description: 'Some model files may still be in use. Close other app windows and retry.',
          variant: 'destructive',
        });
      } finally {
        setDownloadingModel(null);
        setDownloadProgress(null);
      }
    }
  };

  const companionModels = availableModels.map((model, index) => decorateModel(model, index));
  const recommendedModelId = pickRecommendedModelId(companionModels, deviceSpecs);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[170] flex" data-tour-id="model-panel">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(31,42,68,0.25)] backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Panel - RIGHT SIDE */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="ml-auto w-96 bg-[var(--card)] shadow-2xl border-l border-[rgba(58,74,99,0.14)] flex flex-col relative z-10 h-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[rgba(58,74,99,0.12)] bg-[var(--inner)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[rgba(216,122,67,0.16)] rounded-xl flex items-center justify-center">
                  <Brain className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Choose your companion</h2>
                  <p className="text-xs text-[var(--text-secondary)]">Pick the companion that feels right for today.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--inner-strong)]"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Info Banner */}
              <div className="p-4 bg-[var(--inner)] rounded-xl border border-[rgba(58,74,99,0.1)]">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-[var(--accent)] mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Private companions on your device</h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Models run locally in your browser. No data sent to servers.
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{buildSystemSummary(deviceSpecs)}</p>
                  </div>
                </div>
              </div>

              {/* Download Progress */}
              {downloadProgress && (
                <Card className="border-[rgba(216,122,67,0.35)] bg-[rgba(216,122,67,0.1)]" data-tour-id="model-download-progress">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {downloadProgress.text}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-[var(--accent)]">
                        {Math.round(downloadProgress.progress * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-[rgba(58,74,99,0.14)] rounded-full h-3">
                      <motion.div 
                        className="bg-[var(--accent)] h-3 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${downloadProgress.progress * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    {downloadingModel && downloadingModel !== '__clearing__' && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelDownload}
                          disabled={isCancellingDownload}
                          className="border-[rgba(220,38,38,0.35)] text-[#B91C1C] hover:bg-[rgba(220,38,38,0.08)] hover:text-[#991B1B]"
                        >
                          {isCancellingDownload ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              Cancelling
                            </>
                          ) : (
                            'Cancel'
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Models List */}
              <div className="space-y-3" data-tour-id="model-download-list">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Companions ({companionModels.length})
                </h3>

                {companionModels.map((model) => {
                  const isCached = cachedModels.includes(model.id);
                  const isDownloading = downloadingModel === model.id;
                  const isActive = activeModel === model.id;
                  const isRecommended = recommendedModelId === model.id;

                  return (
                    <motion.div
                      key={model.id}
                      whileHover={{ scale: 1.01 }}
                      className={`p-4 rounded-[14px] border transition-all ${
                        isRecommended
                          ? 'border-2 border-[var(--accent)] bg-[rgba(216,122,67,0.08)]'
                          : 'border border-[rgba(58,74,99,0.1)] bg-[var(--inner)]'
                      } ${
                        isActive 
                          ? 'bg-[var(--inner-strong)] border-l-[3px] border-l-[var(--accent)]'
                          : 'hover:border-[rgba(58,74,99,0.2)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Brain className={`h-4 w-4 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`} />
                            <span className="font-semibold text-[var(--text-primary)]">
                              {model.companionName}
                            </span>
                            {isRecommended && (
                              <Badge className="text-xs border-[var(--accent)] text-[var(--accent)] bg-[rgba(216,122,67,0.08)]">
                                Recommended
                              </Badge>
                            )}
                            {isActive && (
                              <Badge className="text-xs border-[var(--accent)] text-[var(--accent)] bg-[rgba(216,122,67,0.08)]">
                                Active
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-[var(--text-secondary)] mb-1">
                            {model.personality}
                          </p>

                          {isRecommended && (
                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                              Optimized for your system performance
                            </p>
                          )}

                          <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {model.modelFamily} • {model.size} • {model.parameters}
                          </p>
                        </div>

                        <div className="flex-shrink-0">
                          {isDownloading ? (
                            <Button
                              size="sm"
                              onClick={handleCancelDownload}
                              disabled={isCancellingDownload}
                              className="bg-[rgba(220,38,38,0.92)] hover:bg-[rgba(185,28,28,0.95)] text-white"
                            >
                              {isCancellingDownload ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                  Cancelling
                                </>
                              ) : (
                                'Cancel'
                              )}
                            </Button>
                          ) : isCached ? (
                            <Button
                              size="sm"
                              onClick={() => handleModelSelect(model.id)}
                              data-tour-id="model-select-action"
                              className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                            >
                              Use
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleModelDownload(model)}
                              data-tour-id="model-download-action"
                              disabled={!!downloadingModel}
                              className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
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
                  className="w-full border-[rgba(220,38,38,0.35)] text-[#B91C1C] hover:bg-[rgba(220,38,38,0.08)] hover:text-[#991B1B]"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Downloaded Models
                </Button>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[rgba(58,74,99,0.12)] bg-[var(--inner)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
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
