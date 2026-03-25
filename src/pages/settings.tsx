import { useEffect, useState } from 'react';
import { Shield, User, Bell, Brain, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ModelDownloadPanel } from '@/components/chat/ModelDownloadPanel';
import { webllmService } from '@/services/webllm-service';

export default function SettingsPage() {
  const { user } = useAuth();
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
  const [modelFeedback, setModelFeedback] = useState<string | null>(null);
  const [showModelFeedback, setShowModelFeedback] = useState(false);

  useEffect(() => {
    const refreshModelState = async () => {
      setActiveModel(webllmService.getActiveModel());
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

  return (
    <div className="journal-shell min-h-screen journal-main p-6 [font-family:Inter,sans-serif] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="nav-title text-4xl leading-tight">Settings</h1>
          <p className="text-[var(--text-secondary)]">
            Manage your account and app preferences.
          </p>
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

        <section className="dashboard-card-primary rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--inner)]">
              <Brain className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Local AI Model</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Current model: {activeModel || 'No model selected'}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {cachedCount} downloaded model{cachedCount === 1 ? '' : 's'} available on this device.
              </p>

              <div className="flex flex-wrap gap-3 mt-4">
                <Button
                  type="button"
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
