import { useEffect, useState } from 'react';
import { Shield, User, Bell, Brain, Download, RefreshCw, Trash2, DatabaseZap, FileDown, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ModelDownloadPanel } from '@/components/chat/ModelDownloadPanel';
import { webllmService } from '@/services/webllm-service';
import { chatMemoryService } from '@/services/chat-memory-service';
import { deviceMemoryService } from '@/services/device-memory-service';
import { useToast } from '@/hooks/use-toast';
import { useTour } from '@/contexts/TourContext';

type RagTelemetrySnapshot = {
  timestamp?: string;
  intent?: string;
  selectedCount?: number;
  promptChars?: number;
  timingsMs?: {
    total?: number;
  };
  reranker?: {
    strategy?: string;
    changedPositions?: number;
  };
  degraded?: {
    vectorSkipped?: boolean;
    reason?: string;
  };
};

type MemoryDecisionLog = {
  timestamp?: string;
  userId?: string;
  sessionId?: string;
  sourceId?: string;
  action?: 'keep' | 'drop';
  label?: 'noise' | 'useful' | 'durable-fact-candidate';
  score?: number;
  reasons?: string[];
};

const TELEMETRY_SNAPSHOTS_KEY = 'mindscribe.rag.telemetry.snapshots';
const MEMORY_DECISION_LOG_KEY = 'mindscribe.memory.classifier.decisions';
const FLAG_RETRIEVAL_TELEMETRY = 'mindscribe.rag.pipeline.telemetry';
const FLAG_TELEMETRY_PERSIST = 'mindscribe.rag.pipeline.telemetry.persist';
const FLAG_RERANKER = 'mindscribe.rag.pipeline.reranker';
const FLAG_BM25 = 'mindscribe.rag.pipeline.lexical.bm25';
const FLAG_MEMORY_CLASSIFIER_DEBUG = 'mindscribe.memory.classifier.debug';
const FLAG_MEMORY_DEDUPE_SEMANTIC = 'mindscribe.memory.dedupe.semantic';

const parseFlagValue = (rawValue: string | null, fallback: boolean): boolean => {
  if (rawValue === null) {
    return fallback;
  }
  if (rawValue === '1' || rawValue === 'true') {
    return true;
  }
  if (rawValue === '0' || rawValue === 'false') {
    return false;
  }
  return fallback;
};

const formatSnapshotTime = (value?: string): string => {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { startTour } = useTour();
  const { toast } = useToast();
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
  const [modelFeedback, setModelFeedback] = useState<string | null>(null);
  const [showModelFeedback, setShowModelFeedback] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [isDeletingMemory, setIsDeletingMemory] = useState(false);
  const [isTurboInferenceEnabled, setIsTurboInferenceEnabled] = useState(false);
  const [isRagTelemetryEnabled, setIsRagTelemetryEnabled] = useState(true);
  const [isTelemetryPersistenceEnabled, setIsTelemetryPersistenceEnabled] = useState(false);
  const [isRerankerEnabled, setIsRerankerEnabled] = useState(true);
  const [isBm25Enabled, setIsBm25Enabled] = useState(true);
  const [isMemoryClassifierDebugEnabled, setIsMemoryClassifierDebugEnabled] = useState(false);
  const [isSemanticDedupeEnabled, setIsSemanticDedupeEnabled] = useState(true);
  const [ragSnapshots, setRagSnapshots] = useState<RagTelemetrySnapshot[]>([]);
  const [memoryDecisionLogs, setMemoryDecisionLogs] = useState<MemoryDecisionLog[]>([]);

  useEffect(() => {
    const refreshModelState = async () => {
      setActiveModel(webllmService.getActiveModel());
      setIsTurboInferenceEnabled(webllmService.isTurboModeEnabled());
      try {
        const cached = await webllmService.getCachedModelsAsync();
        setCachedCount(cached.length);
      } catch {
        setCachedCount(webllmService.getCachedModels().length);
      }
    };

    refreshModelState();
    const interval = setInterval(refreshModelState, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadRagDebugSettings = () => {
    if (typeof window === 'undefined') {
      return;
    }

    setIsRagTelemetryEnabled(parseFlagValue(window.localStorage.getItem(FLAG_RETRIEVAL_TELEMETRY), true));
    setIsTelemetryPersistenceEnabled(parseFlagValue(window.localStorage.getItem(FLAG_TELEMETRY_PERSIST), false));
    setIsRerankerEnabled(parseFlagValue(window.localStorage.getItem(FLAG_RERANKER), true));
    setIsBm25Enabled(parseFlagValue(window.localStorage.getItem(FLAG_BM25), true));
    setIsMemoryClassifierDebugEnabled(parseFlagValue(window.localStorage.getItem(FLAG_MEMORY_CLASSIFIER_DEBUG), false));
    setIsSemanticDedupeEnabled(parseFlagValue(window.localStorage.getItem(FLAG_MEMORY_DEDUPE_SEMANTIC), true));

    try {
      const raw = window.localStorage.getItem(TELEMETRY_SNAPSHOTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setRagSnapshots(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRagSnapshots([]);
    }

    try {
      const raw = window.localStorage.getItem(MEMORY_DECISION_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setMemoryDecisionLogs(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMemoryDecisionLogs([]);
    }
  };

  useEffect(() => {
    loadRagDebugSettings();
  }, []);

  const updateFlag = (
    key: string,
    value: boolean,
    apply: (next: boolean) => void,
    label: string,
  ) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(key, value ? 'true' : 'false');
    apply(value);
    toast({
      title: 'RAG setting updated',
      description: `${label} ${value ? 'enabled' : 'disabled'}.`,
    });
  };

  const handleExportSnapshots = () => {
    if (typeof window === 'undefined' || !ragSnapshots.length) {
      return;
    }

    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: ragSnapshots.length,
        snapshots: ragSnapshots,
      },
      null,
      2,
    );

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rag-telemetry-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Telemetry exported',
      description: `Exported ${ragSnapshots.length} snapshot${ragSnapshots.length === 1 ? '' : 's'}.`,
    });
  };

  const handleClearSnapshots = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const confirmed = window.confirm('Clear all persisted RAG telemetry snapshots?');
    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(TELEMETRY_SNAPSHOTS_KEY);
    setRagSnapshots([]);
    toast({
      title: 'Telemetry cleared',
      description: 'Persisted RAG telemetry snapshots were removed.',
    });
  };

  const handleExportMemoryDecisionLogs = () => {
    if (typeof window === 'undefined' || !memoryDecisionLogs.length) {
      return;
    }

    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: memoryDecisionLogs.length,
        decisions: memoryDecisionLogs,
      },
      null,
      2,
    );

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `memory-classifier-decisions-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Classifier log exported',
      description: `Exported ${memoryDecisionLogs.length} decision log${memoryDecisionLogs.length === 1 ? '' : 's'}.`,
    });
  };

  const handleClearMemoryDecisionLogs = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const confirmed = window.confirm('Clear all persisted memory classifier decision logs?');
    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(MEMORY_DECISION_LOG_KEY);
    setMemoryDecisionLogs([]);
    toast({
      title: 'Classifier log cleared',
      description: 'Persisted memory classifier decision logs were removed.',
    });
  };

  const latestSnapshot = ragSnapshots.length ? ragSnapshots[ragSnapshots.length - 1] : null;
  const latestMemoryDecision = memoryDecisionLogs.length ? memoryDecisionLogs[memoryDecisionLogs.length - 1] : null;
  const averageLatencyMs = ragSnapshots.length
    ? Math.round(
      ragSnapshots.reduce((total, snapshot) => total + Number(snapshot.timingsMs?.total ?? 0), 0)
      / ragSnapshots.length,
    )
    : 0;

  const handleDeleteHistory = async () => {
    const userId = user?.username;
    if (!userId || isDeletingHistory) {
      return;
    }

    const confirmed = window.confirm(
      'Delete all conversations? This will remove every chat session history for your account.',
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingHistory(true);
    try {
      const deletedCount = await chatMemoryService.deleteAllUserSessions(userId);
      toast({
        title: 'Chat history deleted',
        description: deletedCount > 0
          ? `Removed ${deletedCount} conversation${deletedCount === 1 ? '' : 's'}.`
          : 'No conversations were found to delete.',
      });
    } catch (error) {
      console.error('Failed to delete chat history:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete chat history. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingHistory(false);
    }
  };

  const handleDeleteMemory = async () => {
    const userId = user?.username;
    if (!userId || isDeletingMemory) {
      return;
    }

    const confirmed = window.confirm(
      'Delete all RAG memory? This will remove all indexed memory records and vectors for your account.',
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingMemory(true);
    try {
      await deviceMemoryService.clearAllUserMemory(userId);
      toast({
        title: 'Memory deleted',
        description: 'All RAG memory has been removed for your account.',
      });
    } catch (error) {
      console.error('Failed to delete RAG memory:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete RAG memory. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingMemory(false);
    }
  };

  const handleTurboToggle = (enabled: boolean) => {
    webllmService.setInferenceProfile(enabled ? 'turbo' : 'balanced');
    setIsTurboInferenceEnabled(enabled);
    toast({
      title: 'Inference profile updated',
      description: enabled
        ? 'Turbo mode enabled: faster responses with tighter generation budget.'
        : 'Balanced mode enabled: default quality-speed balance restored.',
    });
  };

  const handleUseFastestCachedModel = async () => {
    const modelId = webllmService.getFastestCachedModelId();
    if (!modelId) {
      toast({
        title: 'No fast cached model',
        description: 'Download a compact q4 model first (for example Qwen2.5 0.5B or 1.5B).',
      });
      setIsModelPanelOpen(true);
      return;
    }

    setActiveModel(modelId);
    webllmService.setActiveModel(modelId);
    toast({
      title: 'Fast model selected',
      description: `Selected ${modelId} as your active model.`,
    });
  };

  return (
    <div className="journal-shell min-h-screen journal-main p-6 [font-family:Inter,sans-serif] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="nav-title text-4xl leading-tight">Settings</h1>
          <p className="text-[var(--text-secondary)]">
            Manage your account and app preferences.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => startTour(true)}
              className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
            >
              Restart First-Time Tour
            </Button>
          </div>
        </header>

        <section className="dashboard-card-primary rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--inner)]">
              <User className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Account</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Signed in as {user?.name || user?.username}
              </p>
              {user?.email && (
                <p className="text-sm text-[var(--text-secondary)] mt-1">{user.email}</p>
              )}
            </div>
          </div>
        </section>

        <section className="dashboard-card-secondary rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--card)]">
              <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Preferences</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Additional preferences will appear here as more customization options are added.
              </p>
            </div>
          </div>
        </section>

        <section className="dashboard-card-primary rounded-2xl p-5" data-tour-id="settings-local-model">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--inner)]">
              <Brain className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Local AI Model</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1" data-tour-id="settings-model-status">
                Current model: {activeModel || 'No model selected'}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {cachedCount} downloaded model{cachedCount === 1 ? '' : 's'} available on this device.
              </p>

              <div className="flex flex-wrap gap-3 mt-4">
                <Button
                  type="button"
                  data-tour-id="settings-download-model"
                  onClick={() => setIsModelPanelOpen(true)}
                  className="bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Model
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModelPanelOpen(true)}
                  className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Change Model
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUseFastestCachedModel}
                  className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Use Fastest Cached Model
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Turbo Inference Mode</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Turbo profile applies aggressive generation settings for faster token output.
                  </p>
                </div>
                <Switch
                  checked={isTurboInferenceEnabled}
                  onCheckedChange={handleTurboToggle}
                />
              </div>

              {modelFeedback && (
                <p
                  className={`text-[13px] text-[#6B7280] transition-opacity duration-300 mt-3 ${showModelFeedback ? 'opacity-80' : 'opacity-0'}`}
                >
                  {modelFeedback}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="dashboard-card-tertiary rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--card)]">
              <Shield className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Privacy</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Your journal and analysis data remain private and are processed locally where possible.
              </p>
            </div>
          </div>
        </section>

        <section className="dashboard-card-tertiary rounded-2xl p-5 border border-[rgba(220,38,38,0.22)]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[rgba(220,38,38,0.14)]">
              <Trash2 className="w-4 h-4 text-[#DC2626]" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Data Deletion</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Delete chat history or clear all RAG memory. These actions cannot be undone.
              </p>

              <div className="flex flex-wrap gap-3 mt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteHistory}
                  disabled={!user?.username || isDeletingHistory || isDeletingMemory}
                  className="bg-[#B91C1C] hover:bg-[#991B1B]"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeletingHistory ? 'Deleting history...' : 'Delete History'}
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteMemory}
                  disabled={!user?.username || isDeletingMemory || isDeletingHistory}
                  className="bg-[#991B1B] hover:bg-[#7F1D1D]"
                >
                  <DatabaseZap className="w-4 h-4 mr-2" />
                  {isDeletingMemory ? 'Deleting memory...' : 'Delete Memory'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-card-primary rounded-2xl p-5 border border-[rgba(58,74,99,0.18)]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--inner)]">
              <DatabaseZap className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">RAG Debug Telemetry</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Control retrieval debug flags and inspect persisted telemetry snapshots.
              </p>

              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Telemetry Logging</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.rag.pipeline.telemetry</p>
                  </div>
                  <Switch
                    checked={isRagTelemetryEnabled}
                    onCheckedChange={(checked) =>
                      updateFlag(FLAG_RETRIEVAL_TELEMETRY, checked, setIsRagTelemetryEnabled, 'Telemetry logging')
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Persist Snapshots</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.rag.pipeline.telemetry.persist</p>
                  </div>
                  <Switch
                    checked={isTelemetryPersistenceEnabled}
                    onCheckedChange={(checked) =>
                      updateFlag(FLAG_TELEMETRY_PERSIST, checked, setIsTelemetryPersistenceEnabled, 'Snapshot persistence')
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Reranker</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.rag.pipeline.reranker</p>
                  </div>
                  <Switch
                    checked={isRerankerEnabled}
                    onCheckedChange={(checked) =>
                      updateFlag(FLAG_RERANKER, checked, setIsRerankerEnabled, 'Reranker')
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">BM25 Lexical</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.rag.pipeline.lexical.bm25</p>
                  </div>
                  <Switch
                    checked={isBm25Enabled}
                    onCheckedChange={(checked) =>
                      updateFlag(FLAG_BM25, checked, setIsBm25Enabled, 'BM25 lexical')
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Memory Classifier Debug</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.memory.classifier.debug</p>
                  </div>
                  <Switch
                    checked={isMemoryClassifierDebugEnabled}
                    onCheckedChange={(checked) =>
                      updateFlag(
                        FLAG_MEMORY_CLASSIFIER_DEBUG,
                        checked,
                        setIsMemoryClassifierDebugEnabled,
                        'Memory classifier debug logging',
                      )
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[var(--inner)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Semantic Dedupe</p>
                    <p className="text-xs text-[var(--text-secondary)]">mindscribe.memory.dedupe.semantic</p>
                  </div>
                  <Switch
                    checked={isSemanticDedupeEnabled}
                    onCheckedChange={(checked) =>
                      updateFlag(
                        FLAG_MEMORY_DEDUPE_SEMANTIC,
                        checked,
                        setIsSemanticDedupeEnabled,
                        'Semantic dedupe',
                      )
                    }
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[rgba(58,74,99,0.14)] bg-[var(--card)] p-3">
                <p className="text-sm font-medium">Snapshot Summary</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 mt-2 text-sm">
                  <p className="text-[var(--text-secondary)]">Saved snapshots: <span className="text-[var(--text-primary)]">{ragSnapshots.length}</span></p>
                  <p className="text-[var(--text-secondary)]">Avg latency: <span className="text-[var(--text-primary)]">{averageLatencyMs} ms</span></p>
                  <p className="text-[var(--text-secondary)]">Latest intent: <span className="text-[var(--text-primary)]">{latestSnapshot?.intent || 'n/a'}</span></p>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  Latest: {latestSnapshot ? formatSnapshotTime(latestSnapshot.timestamp) : 'No snapshots yet'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadRagDebugSettings}
                  className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportSnapshots}
                  disabled={!ragSnapshots.length}
                  className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export JSON
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearSnapshots}
                  disabled={!ragSnapshots.length}
                  className="bg-[#991B1B] hover:bg-[#7F1D1D]"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Snapshots
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {ragSnapshots.slice(-5).reverse().map((snapshot, index) => (
                  <div
                    key={`${snapshot.timestamp || 'snapshot'}-${index}`}
                    className="rounded-xl border border-[rgba(58,74,99,0.12)] bg-[var(--inner)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                  >
                    <p className="text-[var(--text-primary)] font-medium">{formatSnapshotTime(snapshot.timestamp)}</p>
                    <p>
                      intent={snapshot.intent || 'n/a'} | selected={snapshot.selectedCount ?? 0} | promptChars={snapshot.promptChars ?? 0} | totalMs={snapshot.timingsMs?.total ?? 0}
                    </p>
                    <p>
                      reranker={snapshot.reranker?.strategy || 'none'} | changed={snapshot.reranker?.changedPositions ?? 0} | degraded={String(snapshot.degraded?.vectorSkipped ?? false)}{snapshot.degraded?.reason ? ` (${snapshot.degraded.reason})` : ''}
                    </p>
                  </div>
                ))}
                {!ragSnapshots.length && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    No persisted snapshots yet. Enable "Persist Snapshots" and send a few chat turns.
                  </p>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-[rgba(58,74,99,0.14)] bg-[var(--card)] p-3">
                <p className="text-sm font-medium">Memory Classifier Decision Logs</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 mt-2 text-sm">
                  <p className="text-[var(--text-secondary)]">Saved logs: <span className="text-[var(--text-primary)]">{memoryDecisionLogs.length}</span></p>
                  <p className="text-[var(--text-secondary)]">Latest action: <span className="text-[var(--text-primary)]">{latestMemoryDecision?.action || 'n/a'}</span></p>
                  <p className="text-[var(--text-secondary)]">Latest label: <span className="text-[var(--text-primary)]">{latestMemoryDecision?.label || 'n/a'}</span></p>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  Latest: {latestMemoryDecision ? formatSnapshotTime(latestMemoryDecision.timestamp) : 'No decisions yet'}
                </p>

                <div className="flex flex-wrap gap-3 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportMemoryDecisionLogs}
                    disabled={!memoryDecisionLogs.length}
                    className="border-[rgba(58,74,99,0.16)] text-[var(--text-primary)] hover:bg-[var(--inner)]"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export Decisions
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleClearMemoryDecisionLogs}
                    disabled={!memoryDecisionLogs.length}
                    className="bg-[#991B1B] hover:bg-[#7F1D1D]"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Decisions
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {memoryDecisionLogs.slice(-5).reverse().map((decision, index) => (
                    <div
                      key={`${decision.timestamp || 'decision'}-${index}`}
                      className="rounded-xl border border-[rgba(58,74,99,0.12)] bg-[var(--inner)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                    >
                      <p className="text-[var(--text-primary)] font-medium">{formatSnapshotTime(decision.timestamp)}</p>
                      <p>
                        action={decision.action || 'n/a'} | label={decision.label || 'n/a'} | score={Number(decision.score ?? 0).toFixed(2)}
                      </p>
                      <p>
                        source={decision.sourceId || 'n/a'} | session={decision.sessionId || 'n/a'}
                      </p>
                      <p>
                        reasons={(decision.reasons || []).join(', ') || 'n/a'}
                      </p>
                    </div>
                  ))}
                  {!memoryDecisionLogs.length && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      No classifier decisions yet. Enable "Memory Classifier Debug" and send a few chat turns.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ModelDownloadPanel
        isOpen={isModelPanelOpen}
        onClose={() => setIsModelPanelOpen(false)}
        selectedModel={activeModel || undefined}
        onModelSelect={(modelId) => {
          setActiveModel(modelId);
          setModelFeedback('Model switched');
          setShowModelFeedback(true);
          setTimeout(() => setShowModelFeedback(false), 1400);
          setTimeout(() => setModelFeedback(null), 1750);
        }}
      />
    </div>
  );
}
