/**
 * F017-F020: Journal Page
 * 
 * Mental health journaling with AI analysis.
 * Enterprise-grade UI following skills.sh guidelines:
 * - Vercel React Best Practices (memoization, performance)
 * - Anthropic Frontend Design (bold aesthetics, refined details)
 * 
 * @module pages/journal
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { journalService, JournalEntry, JournalAnalysis } from '@/services/journal-service';
import { webllmService } from '@/services/webllm-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  PenLine,
  BookOpen,
  Search,
  Plus,
  Save,
  Trash2,
  Star,
  StarOff,
  Brain,
  Loader2,
  Calendar,
  FileText,
  Smile,
  Frown,
  Meh,
  TrendingUp,
  Sparkles,
  ArrowLeft,
  X,
  Clock,
  Activity,
  Zap,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';

// =============================================================================
// DESIGN TOKENS - Cohesive Color System
// =============================================================================

const MOOD_CONFIG = {
  positive: {
    icon: Smile,
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
  },
  negative: {
    icon: Frown,
    gradient: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-500/10',
    text: 'text-rose-500',
    border: 'border-rose-500/30',
    glow: 'shadow-rose-500/20',
  },
  mixed: {
    icon: TrendingUp,
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
  },
  neutral: {
    icon: Meh,
    gradient: 'from-slate-500 to-gray-500',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    glow: 'shadow-slate-500/20',
  },
} as const;

const STRESS_CONFIG = {
  low: { label: 'Low Stress', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  moderate: { label: 'Moderate', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  high: { label: 'High Stress', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  severe: { label: 'Severe', color: 'text-rose-500', bg: 'bg-rose-500/10' },
} as const;

// =============================================================================
// ANIMATION VARIANTS - Refined Motion Design
// =============================================================================

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

// =============================================================================
// UTILITY FUNCTIONS - Memoized for Performance
// =============================================================================

const formatEntryDate = (date: Date | string): string => {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (isThisWeek(d)) return format(d, 'EEEE');
  return format(d, 'MMM d, yyyy');
};

const getMoodConfig = (mood: JournalAnalysis['mood'] | undefined) => {
  return MOOD_CONFIG[mood || 'neutral'];
};

// =============================================================================
// MOOD INDICATOR COMPONENT - Visual Feedback
// =============================================================================

interface MoodIndicatorProps {
  mood?: JournalAnalysis['mood'];
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const MoodIndicator = memo<MoodIndicatorProps>(({ mood, size = 'md', showLabel = true }) => {
  const config = getMoodConfig(mood);
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className={cn('flex items-center gap-1.5', config.text)}>
      <div className={cn('rounded-full p-1', config.bg)}>
        <Icon className={sizeClasses[size]} />
      </div>
      {showLabel && (
        <span className="text-xs font-medium capitalize">{mood || 'neutral'}</span>
      )}
    </div>
  );
});
MoodIndicator.displayName = 'MoodIndicator';

// =============================================================================
// ANALYSIS CARD - AI Insights Display
// =============================================================================

interface AnalysisCardProps {
  analysis: JournalAnalysis;
}

const AnalysisCard = memo<AnalysisCardProps>(({ analysis }) => {
  const moodConfig = getMoodConfig(analysis.mood);
  const stressConfig = STRESS_CONFIG[analysis.stressLevel];

  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-gray-700/50 bg-gradient-to-br from-gray-900/50 to-gray-800/30 p-4 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="rounded-lg p-2 bg-gradient-to-br from-blue-500 to-purple-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">AI Analysis</h4>
          <p className="text-xs text-gray-400">Powered by WebLLM</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Mood */}
        <div className="rounded-lg bg-gray-800/50 p-3">
          <span className="text-xs text-gray-400 block mb-1">Mood</span>
          <MoodIndicator mood={analysis.mood} size="md" />
        </div>

        {/* Stress */}
        <div className="rounded-lg bg-gray-800/50 p-3">
          <span className="text-xs text-gray-400 block mb-1">Stress Level</span>
          <div className={cn('flex items-center gap-1.5', stressConfig.color)}>
            <div className={cn('rounded-full p-1', stressConfig.bg)}>
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium">{stressConfig.label}</span>
          </div>
        </div>

        {/* Sentiment */}
        <div className="rounded-lg bg-gray-800/50 p-3 col-span-2">
          <span className="text-xs text-gray-400 block mb-2">Sentiment Score</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${((analysis.sentimentScore + 1) / 2) * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={cn('h-full rounded-full bg-gradient-to-r', moodConfig.gradient)}
              />
            </div>
            <span className="text-sm font-mono text-gray-300">
              {analysis.sentimentScore.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Emotions */}
      {analysis.emotions.length > 0 && (
        <div className="mb-4">
          <span className="text-xs text-gray-400 block mb-2">Detected Emotions</span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.emotions.map((emotion, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-xs bg-gray-700/50 text-gray-300 hover:bg-gray-700"
              >
                {emotion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg bg-gray-800/30 p-3 border border-gray-700/50">
        <p className="text-sm text-gray-300 leading-relaxed">{analysis.summary}</p>
      </div>

      {/* Suggestions */}
      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <div className="mt-4">
          <span className="text-xs text-gray-400 flex items-center gap-1 mb-2">
            <Target className="h-3 w-3" />
            Suggestions
          </span>
          <ul className="space-y-1">
            {analysis.suggestions.map((suggestion, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <Zap className="h-3 w-3 mt-0.5 text-blue-400 shrink-0" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
});
AnalysisCard.displayName = 'AnalysisCard';

// =============================================================================
// JOURNAL EDITOR COMPONENT
// =============================================================================

interface JournalEditorProps {
  entry?: JournalEntry | null;
  onSave: (title: string, content: string) => Promise<void>;
  onCancel: () => void;
  onAnalyze?: (id: string) => Promise<void>;
}

const JournalEditor = memo<JournalEditorProps>(({
  entry,
  onSave,
  onCancel,
  onAnalyze,
}) => {
  const [title, setTitle] = useState(entry?.title || '');
  const [content, setContent] = useState(entry?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Auto-save draft every 30 seconds (only for new entries)
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

  // Load draft on mount (only for new entries)
  useEffect(() => {
    if (!entry) {
      journalService.getDraft().then(draft => {
        if (draft) {
          setContent(draft.content);
          setTitle(draft.title);
        }
      });
    }
  }, [entry]);

  const wordCount = useMemo(() => {
    return content.trim().split(/\s+/).filter(Boolean).length;
  }, [content]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;
    
    setIsSaving(true);
    try {
      await onSave(title || 'Untitled Entry', content);
      await journalService.clearDraft();
    } finally {
      setIsSaving(false);
    }
  }, [content, title, onSave]);

  const handleAnalyze = useCallback(async () => {
    if (!entry?.id || !onAnalyze) return;
    
    setIsAnalyzing(true);
    try {
      await onAnalyze(entry.id);
    } finally {
      setIsAnalyzing(false);
    }
  }, [entry?.id, onAnalyze]);

  const llmReady = webllmService.isModelLoaded();

  return (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full bg-gray-900"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {lastSaved && !entry && (
            <span className="text-xs text-gray-500 hidden sm:block">
              Draft saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
            </span>
          )}

          {entry && onAnalyze && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !llmReady}
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Analyze
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {llmReady ? 'Analyze with AI' : 'Load AI model first'}
              </TooltipContent>
            </Tooltip>
          )}

          <Button
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </header>

      {/* Editor Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Writing Area */}
        <div className="flex-1 flex flex-col p-6 overflow-auto">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your entry a title..."
            className="text-xl font-semibold border-none bg-transparent focus-visible:ring-0 px-0 text-white placeholder:text-gray-600 mb-4"
          />
          
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your thoughts here... Express yourself freely. This is your safe space for reflection and self-discovery."
            className="flex-1 min-h-[300px] resize-none border-none bg-transparent focus-visible:ring-0 px-0 text-base leading-relaxed text-gray-300 placeholder:text-gray-600"
          />

          {/* Footer Stats */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-800 mt-4 text-sm text-gray-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {wordCount} words
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                ~{Math.ceil(wordCount / 200)} min read
              </span>
            </div>
            {entry && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(entry.createdAt), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Analysis Sidebar (if available) */}
        {entry?.analysis && (
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-800 p-4 overflow-auto bg-gray-900/50">
            <AnalysisCard analysis={entry.analysis} />
          </div>
        )}
      </div>
    </motion.div>
  );
});
JournalEditor.displayName = 'JournalEditor';

// =============================================================================
// ENTRY CARD COMPONENT
// =============================================================================

interface EntryCardProps {
  entry: JournalEntry;
  onClick: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

const EntryCard = memo<EntryCardProps>(({
  entry,
  onClick,
  onDelete,
  onToggleFavorite,
}) => {
  const moodConfig = entry.analysis ? getMoodConfig(entry.analysis.mood) : null;

  return (
    <motion.div
      variants={fadeInUp}
      layout
      className="group"
    >
      <Card
        className={cn(
          'cursor-pointer transition-all duration-300 bg-gray-800/50 border-gray-700/50',
          'hover:bg-gray-800/80 hover:border-gray-600/50 hover:shadow-lg',
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Mood Indicator Line */}
            <div
              className={cn(
                'w-1 h-16 rounded-full shrink-0 transition-all',
                moodConfig
                  ? `bg-gradient-to-b ${moodConfig.gradient}`
                  : 'bg-gray-600'
              )}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-white truncate">{entry.title}</h3>
                
                {/* Actions - Show on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-amber-400 hover:bg-amber-400/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite();
                        }}
                      >
                        {entry.isFavorite ? (
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        ) : (
                          <StarOff className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{entry.isFavorite ? 'Unfavorite' : 'Favorite'}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-rose-400 hover:bg-rose-400/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                {entry.content.substring(0, 150)}...
              </p>

              {/* Meta Info */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatEntryDate(entry.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {entry.wordCount} words
                </span>
                {entry.analysis && (
                  <MoodIndicator mood={entry.analysis.mood} size="sm" />
                )}
                {entry.isFavorite && (
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
EntryCard.displayName = 'EntryCard';

// =============================================================================
// EMPTY STATE - Encouraging First Entry
// =============================================================================

const EmptyState = memo<{ onCreateNew: () => void; hasSearch: boolean }>(({ onCreateNew, hasSearch }) => (
  <motion.div
    variants={fadeInUp}
    initial="initial"
    animate="animate"
    className="text-center py-16 px-6"
  >
    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center">
      <PenLine className="h-10 w-10 text-blue-400" />
    </div>
    <h3 className="text-xl font-semibold text-white mb-2">
      {hasSearch ? 'No entries found' : 'Start Your Journal'}
    </h3>
    <p className="text-gray-400 max-w-md mx-auto mb-6">
      {hasSearch
        ? 'Try a different search term or clear your search'
        : 'Writing helps you understand your thoughts and emotions. Begin your mental wellness journey today.'}
    </p>
    {!hasSearch && (
      <Button
        onClick={onCreateNew}
        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
      >
        <Plus className="h-4 w-4 mr-2" />
        Write Your First Entry
      </Button>
    )}
  </motion.div>
));
EmptyState.displayName = 'EmptyState';

// =============================================================================
// LOADING STATE - Skeleton UI
// =============================================================================

const LoadingSkeleton = memo(() => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="bg-gray-800/50 border-gray-700/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton className="w-1 h-16 rounded-full bg-gray-700" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3 bg-gray-700" />
              <Skeleton className="h-4 w-full bg-gray-700" />
              <Skeleton className="h-4 w-2/3 bg-gray-700" />
              <div className="flex gap-4 pt-2">
                <Skeleton className="h-3 w-20 bg-gray-700" />
                <Skeleton className="h-3 w-16 bg-gray-700" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

// =============================================================================
// MAIN JOURNAL PAGE
// =============================================================================

const JournalPage: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize service with user ID
  useEffect(() => {
    if (user?.username) {
      journalService.setUserId(user.username);
      loadEntries();
    }
  }, [user]);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await journalService.getAllEntries();
      setEntries(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateEntry = useCallback(async (title: string, content: string) => {
    const newEntry = await journalService.createEntry({ title, content });
    setEntries(prev => [newEntry, ...prev]);
    setIsCreating(false);
    setSelectedEntry(newEntry);
    setIsEditing(true);
  }, []);

  const handleUpdateEntry = useCallback(async (title: string, content: string) => {
    if (!selectedEntry) return;
    
    const updated = await journalService.updateEntry(selectedEntry.id, { title, content });
    if (updated) {
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      setSelectedEntry(updated);
    }
  }, [selectedEntry]);

  const handleDeleteEntry = useCallback(async () => {
    if (!deleteEntryId) return;
    
    await journalService.deleteEntry(deleteEntryId);
    setEntries(prev => prev.filter(e => e.id !== deleteEntryId));
    
    if (selectedEntry?.id === deleteEntryId) {
      setSelectedEntry(null);
      setIsEditing(false);
    }
    
    setDeleteEntryId(null);
  }, [deleteEntryId, selectedEntry?.id]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    const updated = await journalService.toggleFavorite(id);
    if (updated) {
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    }
  }, []);

  const handleAnalyze = useCallback(async (id: string) => {
    const analysis = await journalService.analyzeEntry(id);
    if (analysis) {
      const updated = await journalService.getEntry(id);
      if (updated) {
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
        setSelectedEntry(updated);
      }
    }
  }, []);

  // Memoized filtered entries
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    
    const query = searchQuery.toLowerCase();
    return entries.filter(entry =>
      entry.title.toLowerCase().includes(query) ||
      entry.content.toLowerCase().includes(query)
    );
  }, [entries, searchQuery]);

  // Quick stats
  const stats = useMemo(() => ({
    total: entries.length,
    favorites: entries.filter(e => e.isFavorite).length,
    analyzed: entries.filter(e => e.analysis).length,
  }), [entries]);

  // Show editor if creating or editing
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
          onAnalyze={handleAnalyze}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <header className="p-6 border-b border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              Journal
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Your private space for reflection and self-discovery
            </p>
          </div>
          
          <Button
            onClick={() => setIsCreating(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <FileText className="h-4 w-4" />
            <span><strong className="text-white">{stats.total}</strong> entries</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Star className="h-4 w-4 text-amber-400" />
            <span><strong className="text-white">{stats.favorites}</strong> favorites</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Brain className="h-4 w-4 text-blue-400" />
            <span><strong className="text-white">{stats.analyzed}</strong> analyzed</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your entries..."
            className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-500 hover:text-white"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      {/* Entry List */}
      <ScrollArea className="flex-1 p-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : filteredEntries.length === 0 ? (
          <EmptyState onCreateNew={() => setIsCreating(true)} hasSearch={!!searchQuery} />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            <AnimatePresence mode="popLayout">
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
            </AnimatePresence>
          </motion.div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone. Your journal entry will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JournalPage;
