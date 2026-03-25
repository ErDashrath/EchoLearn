import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { journalService, JournalEntry } from '@/services/journal-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Calendar,
  Loader2,
  Plus,
  Save,
  Search,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';

const formatEntryDate = (date: Date | string): string => {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return d.toLocaleDateString();
};

interface JournalEditorProps {
  entry?: JournalEntry | null;
  onSave: (title: string, content: string) => Promise<JournalEntry | null>;
  onCancel: () => void;
}

const JournalEditor: React.FC<JournalEditorProps> = ({ entry, onSave, onCancel }) => {
  const [title, setTitle] = useState(entry?.title || '');
  const [content, setContent] = useState(entry?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(entry?.id || null);
  const [showReflectionPrompt, setShowReflectionPrompt] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [generatedInsight, setGeneratedInsight] = useState<string | null>(null);

  useEffect(() => {
    setSavedEntryId(entry?.id || null);
  }, [entry?.id]);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title || '');
    setContent(entry.content || '');
  }, [entry?.id]);

  useEffect(() => {
    if (entry) return;

    const timer = setInterval(async () => {
      if (content.trim()) {
        await journalService.saveDraft(content, title);
        setLastSaved(new Date());
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [content, title, entry]);

  useEffect(() => {
    if (!entry) {
      journalService.getDraft().then((draft) => {
        if (draft) {
          setContent(draft.content);
          setTitle(draft.title);
        }
      });
    }
  }, [entry]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      const savedEntry = await onSave(title || 'Untitled Entry', content);
      if (savedEntry?.id) {
        setSavedEntryId(savedEntry.id);
      }
      setShowReflectionPrompt(true);
      setGeneratedInsight(null);
      setInlineFeedback(entry ? 'Updated' : 'Saved');
      setShowFeedback(true);
      await journalService.clearDraft();

      setTimeout(() => setShowFeedback(false), 1400);
      setTimeout(() => setInlineFeedback(null), 1750);
    } finally {
      setIsSaving(false);
    }
  }, [content, title, onSave, entry]);

  const handleGenerateInsight = useCallback(async () => {
    const targetId = savedEntryId || entry?.id || null;
    if (!targetId) return;

    setIsGeneratingInsight(true);
    try {
      const analysis = await journalService.analyzeEntry(targetId);
      if (analysis) {
        const suggestionLine = analysis.suggestions?.length
          ? ` ${analysis.suggestions[0]}`
          : '';
        setGeneratedInsight(`${analysis.summary}${suggestionLine}`.trim());
      }
    } finally {
      setIsGeneratingInsight(false);
    }
  }, [savedEntryId, entry?.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full journal-main [font-family:Inter,sans-serif]"
    >
      <header className="max-w-[680px] w-full mx-auto px-6 pt-6 pb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--inner)] transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className="rounded-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white transition-colors duration-200"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
          {inlineFeedback && (
            <span
              className={cn(
                'text-[13px] text-[#6B7280] transition-opacity duration-300',
                showFeedback ? 'opacity-80' : 'opacity-0'
              )}
            >
              {inlineFeedback}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-[680px] w-full mx-auto px-6 pb-16">
        <p className="nav-title text-3xl text-[var(--text-primary)] mb-5">Take your time.</p>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this thought a title (optional)"
          className="text-3xl border-none bg-transparent focus-visible:ring-0 px-0 mb-6 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/80"
        />

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing... no structure needed."
          className="min-h-[480px] w-full resize-none border-none bg-transparent focus-visible:ring-0 px-0 text-base leading-[1.8] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/75"
        />

        {lastSaved && !entry && (
          <p className="text-xs text-[var(--text-secondary)] mt-4">
            Draft saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
          </p>
        )}

        {showReflectionPrompt && (
          <div className="bg-[var(--inner)] rounded-xl p-3 mt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-[var(--text-primary)]">Want a quick reflection on this?</p>
              <Button
                type="button"
                variant="ghost"
                onClick={handleGenerateInsight}
                disabled={isGeneratingInsight || (!savedEntryId && !entry?.id)}
                className="h-8 rounded-full px-3 bg-[var(--card)] hover:bg-[var(--card)]/85 text-[var(--text-primary)]"
              >
                {isGeneratingInsight && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                Generate insight
              </Button>
            </div>

            {generatedInsight && (
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-3">
                {generatedInsight}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface EntryCardProps {
  entry: JournalEntry;
  onClick: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, onClick, onDelete, onToggleFavorite }) => {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} layout className="group">
      <Card
        className={cn(
          'cursor-pointer bg-[var(--card)] border-0 rounded-2xl transition-all duration-200',
          'hover:shadow-[0_10px_22px_rgba(58,74,99,0.12)]',
        )}
        style={{ borderLeft: '3px solid rgba(216,122,67,0.2)' }}
        onClick={onClick}
      >
        <CardContent className="p-[18px]">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-[var(--text-primary)] truncate">{entry.title}</h3>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--inner)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
              >
                {entry.isFavorite ? (
                  <Star className="h-3.5 w-3.5 fill-[var(--accent)] text-[var(--accent)]" />
                ) : (
                  <StarOff className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[var(--text-secondary)] hover:text-red-700 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-3">
            {entry.content.substring(0, 160)}...
          </p>

          <p className="text-xs text-[var(--text-secondary)]/90 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatEntryDate(entry.createdAt)}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <Card
        key={i}
        className="bg-[var(--card)] border-0 rounded-2xl"
        style={{ borderLeft: '3px solid rgba(216,122,67,0.2)' }}
      >
        <CardContent className="p-[18px] space-y-3">
          <Skeleton className="h-5 w-1/3 bg-[var(--inner)]" />
          <Skeleton className="h-4 w-full bg-[var(--inner)]" />
          <Skeleton className="h-4 w-2/3 bg-[var(--inner)]" />
          <Skeleton className="h-3 w-20 bg-[var(--inner)]" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const JournalPage: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await journalService.getAllEntries();
      setEntries(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.username) {
      journalService.setUserId(user.username);
      void loadEntries();
    }
  }, [user, loadEntries]);

  const handleCreateEntry = useCallback(async (title: string, content: string) => {
    const newEntry = await journalService.createEntry({ title, content });
    setEntries((prev) => [newEntry, ...prev]);
    setIsCreating(false);
    setSelectedEntry(newEntry);
    setIsEditing(true);
    return newEntry;
  }, []);

  const handleUpdateEntry = useCallback(async (title: string, content: string) => {
    if (!selectedEntry) return null;
    const updated = await journalService.updateEntry(selectedEntry.id, { title, content });
    if (updated) {
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setSelectedEntry(updated);
    }
    return updated;
  }, [selectedEntry]);

  const handleDeleteEntry = useCallback(async () => {
    if (!deleteEntryId) return;
    await journalService.deleteEntry(deleteEntryId);
    setEntries((prev) => prev.filter((e) => e.id !== deleteEntryId));

    if (selectedEntry?.id === deleteEntryId) {
      setSelectedEntry(null);
      setIsEditing(false);
    }
    setDeleteEntryId(null);
  }, [deleteEntryId, selectedEntry?.id]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    const updated = await journalService.toggleFavorite(id);
    if (updated) {
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    }
  }, []);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter((entry) =>
      entry.title.toLowerCase().includes(query) || entry.content.toLowerCase().includes(query),
    );
  }, [entries, searchQuery]);

  if (isCreating || isEditing) {
    return (
      <AnimatePresence mode="wait">
        <JournalEditor
          entry={isCreating ? null : selectedEntry}
          onSave={isCreating ? handleCreateEntry : handleUpdateEntry}
          onCancel={() => {
            setIsCreating(false);
            setIsEditing(false);
          }}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="h-full flex flex-col journal-main [font-family:Inter,sans-serif]">
      <header className="max-w-[680px] w-full mx-auto px-6 pt-10 pb-6">
        <h1 className="nav-title text-4xl text-[var(--text-primary)]">Your journal</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-2 mb-6">
          A space to clear your mind, one thought at a time.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="relative w-full sm:max-w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your entries..."
              className="pl-10 bg-[var(--inner)] border-0 rounded-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:ring-0"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <Button
            onClick={() => setIsCreating(true)}
            className="rounded-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white transition-colors duration-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start writing
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-[680px] w-full mx-auto px-6 pb-16">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--text-secondary)] mb-5">
                {searchQuery ? 'No entries found for that search.' : 'No entries yet. Start when you are ready.'}
              </p>
              {!searchQuery && (
                <Button
                  onClick={() => setIsCreating(true)}
                  className="rounded-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start writing
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => {
                    setSelectedEntry(entry);
                    setIsEditing(true);
                  }}
                  onDelete={() => setDeleteEntryId(entry.id)}
                  onToggleFavorite={() => handleToggleFavorite(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent className="bg-[var(--card)] border-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--text-primary)]">Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--text-secondary)]">
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[var(--inner)] border-0 text-[var(--text-primary)] hover:bg-[var(--inner)]/80">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-red-700 hover:bg-red-800 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JournalPage;
