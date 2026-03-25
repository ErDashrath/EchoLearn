/**
 * F021-F025: Mental Health Dashboard
 * 
 * Comprehensive analytics dashboard showing:
 * - F021: Stats Overview (entries, mood, streaks)
 * - F022: Mood Trend Charts
 * - F023: Emotion Distribution
 * - F024: Stress Level Analysis
 * - F025: DASS-21 Progress
 * 
 * Following skills.sh guidelines:
 * - Vercel React Best Practices
 * - Anthropic Frontend Design Patterns
 * 
 * @module pages/dashboard
 */

import React, { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Brain,
  Heart,
  Zap,
  Target,
  Award,
  Flame,
  BookOpen,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { journalService, type JournalStats, type JournalEntry } from '@/services/journal-service';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface DashboardStats extends JournalStats {
  trendData: Array<{ date: string; mood: number; stress: number }>;
  emotionData: Array<{ name: string; value: number; color: string }>;
  stressData: Array<{ name: string; value: number; color: string }>;
  balanceData: Array<{ name: string; value: number; percentage: string }>;
  weeklyComparison: {
    currentWeek: number;
    previousWeek: number;
    change: number;
  };
  insights: string[];
}

interface DASS21Results {
  scores: {
    depression: number;
    anxiety: number;
    stress: number;
  };
  severityLevels: {
    depression: { level: string; color: string };
    anxiety: { level: string; color: string };
    stress: { level: string; color: string };
  };
  completedAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const EMOTION_COLORS: Record<string, string> = {
  happy: '#C9D9B8',
  calm: '#B7C9D6',
  grateful: '#CEC4DA',
  hopeful: '#BDD4D5',
  anxious: '#E4CCAB',
  sad: '#CBBED6',
  stressed: '#E8B4A0',
  angry: '#D79B86',
  neutral: '#C6BDB0',
  mixed: '#D4C6DD',
};

const MOOD_COLORS = {
  positive: '#C9D9B8',
  neutral: '#E4CCAB',
  negative: '#E8B4A0',
};

const STRESS_COLORS = {
  low: '#B7C9D6',
  moderate: '#C9D9B8',
  high: '#E8B4A0',
  severe: '#D79B86',
};

const DASS_CATEGORY_STYLE = {
  depression: {
    card: 'bg-[rgba(183,201,214,0.22)] border-[rgba(107,143,163,0.28)]',
    icon: 'text-[#6B8FA3]',
    level: 'bg-[rgba(183,201,214,0.3)] text-[#1F2A44]',
    bar: 'bg-[#8FAFC2]',
  },
  anxiety: {
    card: 'bg-[rgba(201,217,184,0.24)] border-[rgba(122,155,94,0.28)]',
    icon: 'text-[#7A9B5E]',
    level: 'bg-[rgba(201,217,184,0.34)] text-[#1F2A44]',
    bar: 'bg-[#A5BC8B]',
  },
  stress: {
    card: 'bg-[rgba(232,180,160,0.24)] border-[rgba(180,106,85,0.28)]',
    icon: 'text-[#B46A55]',
    level: 'bg-[rgba(232,180,160,0.34)] text-[#1F2A44]',
    bar: 'bg-[#D79B86]',
  },
} as const;

const TIME_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
];

// =============================================================================
// MEMOIZED COMPONENTS
// =============================================================================

const StatCard = memo(({ 
  icon: Icon, 
  label, 
  value, 
  subValue,
  trend,
  color = 'blue'
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}) => {
  const colorClasses = {
    blue: 'bg-[var(--inner)]',
    green: 'bg-[var(--inner)]',
    purple: 'bg-[var(--inner)]',
    orange: 'bg-[var(--inner)]',
    red: 'bg-[var(--inner)]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dashboard-card-primary rounded-[14px] p-4"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${colorClasses[color]}`}>
          <Icon className="w-5 h-5 text-[var(--text-secondary)]" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            trend === 'up' && 'bg-[var(--inner)] text-[var(--text-secondary)]',
            trend === 'down' && 'bg-[var(--inner)] text-[var(--text-secondary)]',
            trend === 'neutral' && 'bg-[var(--inner)] text-[var(--text-secondary)]'
          )}>
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'neutral' && <Minus className="w-3 h-3" />}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-1">{label}</p>
        {subValue && (
          <p className="text-xs text-[var(--text-secondary)]/80 mt-1">{subValue}</p>
        )}
      </div>
    </motion.div>
  );
});

StatCard.displayName = 'StatCard';

const ChartCard = memo(({ 
  title, 
  icon: Icon,
  children,
  className = ''
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      'dashboard-card-tertiary rounded-2xl p-5',
      className
    )}
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 rounded-lg bg-[var(--card)]">
        <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
      </div>
      <h3 className="nav-title text-[19px] leading-tight text-[var(--text-primary)]">{title}</h3>
    </div>
    {children}
  </motion.div>
));

ChartCard.displayName = 'ChartCard';

const DASS21Card = memo(({ 
  title, 
  score, 
  maxScore,
  level, 
  category,
  icon: Icon
}: {
  title: string;
  score: number;
  maxScore: number;
  level: string;
  category: 'depression' | 'anxiety' | 'stress';
  icon: React.ElementType;
}) => {
  const percentage = (score / maxScore) * 100;
  const styleSet = DASS_CATEGORY_STYLE[category];

  return (
    <div className={cn('rounded-xl p-4 border', styleSet.card)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-5 h-5', styleSet.icon)} />
          <span className="font-medium text-[var(--text-primary)]">{title}</span>
        </div>
        <span className={cn(
          'px-2.5 py-1 rounded-full text-xs font-medium',
          styleSet.level
        )}>
          Current level: {level}
        </span>
      </div>
      <div className="text-xl font-semibold text-[var(--text-primary)] mb-2">{score}</div>
      <div className="h-2 bg-[rgba(31,42,68,0.1)] rounded-full overflow-hidden">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.min(1, Math.max(0, percentage / 100)) }}
          transition={{ duration: 0.5 }}
          className={cn('h-full w-full rounded-full origin-left', styleSet.bar)}
        />
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-2">Range: 0-{maxScore}</p>
    </div>
  );
});

DASS21Card.displayName = 'DASS21Card';

const InsightCard = memo(({ insights }: { insights: string[] }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="dashboard-card-primary rounded-2xl p-5"
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-[var(--inner)]">
        <Sparkles className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <h3 className="nav-title text-[22px] leading-tight text-[var(--text-primary)]">AI Insights</h3>
    </div>
    <div className="space-y-3">
      {insights.map((insight, index) => (
        <div key={index} className="flex items-start gap-3 p-3 bg-[var(--inner)]/55 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <p className="text-[18px] leading-relaxed text-[var(--text-primary)]">{insight}</p>
        </div>
      ))}
    </div>
  </motion.div>
));

InsightCard.displayName = 'InsightCard';

const LoadingSkeleton = memo(() => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-[var(--card)] rounded-2xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-80 bg-[var(--inner)] rounded-2xl" />
      <div className="h-80 bg-[var(--inner)] rounded-2xl" />
    </div>
  </div>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';

const EmptyState = memo(() => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center"
  >
    <div className="w-20 h-20 rounded-2xl bg-[var(--inner)] flex items-center justify-center mb-6">
      <BarChart3 className="w-10 h-10 text-[var(--text-secondary)]" />
    </div>
    <h2 className="nav-title text-3xl text-[var(--text-primary)] mb-2">No Data Yet</h2>
    <p className="text-[var(--text-secondary)] max-w-md mb-6">
      Start journaling to see your mental health insights and trends. Your dashboard will come to life as you track your emotional journey.
    </p>
    <Button 
      onClick={() => window.location.href = '/journal'}
      className="bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
    >
      <BookOpen className="w-4 h-4 mr-2" />
      Start Journaling
    </Button>
  </motion.div>
));

EmptyState.displayName = 'EmptyState';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState(30);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dass21Results, setDass21Results] = useState<DASS21Results | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { user, getDASS21Results, hasCompletedDASS21 } = useAuth();

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      
      setIsLoading(true);
      
      try {
        // Set user for journal service
        journalService.setUserId(user.username);
        
        // Load journal stats
        const journalStats = await journalService.getStats();
        const entries = await journalService.getAllEntries();
        
        // Filter entries by time range
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - timeRange);
        
        const filteredEntries = entries.filter(
          e => new Date(e.createdAt) >= cutoffDate
        );
        
        // Process stats
        const processedStats = processStats(filteredEntries, journalStats);
        setStats(processedStats);
        
        // Load DASS-21 results
        if (hasCompletedDASS21) {
          const results = await getDASS21Results();
          setDass21Results(results);
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [user, timeRange, hasCompletedDASS21, getDASS21Results]);

  // Process statistics from entries
  const processStats = (
    entries: JournalEntry[], 
    baseStats: JournalStats
  ): DashboardStats => {
    if (entries.length === 0) {
      return {
        ...baseStats,
        trendData: [],
        emotionData: [],
        stressData: [],
        balanceData: [],
        weeklyComparison: { currentWeek: 0, previousWeek: 0, change: 0 },
        insights: [],
      };
    }

    // Group by date for trend data
    const byDate: Record<string, { moods: number[]; stresses: number[] }> = {};
    const emotionCounts: Record<string, number> = {};
    const stressCounts: Record<string, number> = { low: 0, moderate: 0, high: 0, severe: 0 };
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;

    entries.forEach(entry => {
      if (!entry.analysis) return;
      
      const date = new Date(entry.createdAt).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      if (!byDate[date]) {
        byDate[date] = { moods: [], stresses: [] };
      }
      
      // Mood tracking
      const moodScore = entry.analysis.moodScore;
      byDate[date].moods.push(moodScore);
      
      if (moodScore > 0.3) positiveCount++;
      else if (moodScore < -0.3) negativeCount++;
      else neutralCount++;
      
      // Stress tracking
      byDate[date].stresses.push(entry.analysis.stressScore);
      stressCounts[entry.analysis.stressLevel]++;
      
      // Emotion tracking
      entry.analysis.emotions.forEach(emotion => {
        const normalized = emotion.toLowerCase();
        emotionCounts[normalized] = (emotionCounts[normalized] || 0) + 1;
      });
    });

    // Create trend data
    const trendData = Object.entries(byDate)
      .map(([date, data]) => ({
        date,
        mood: Number((data.moods.reduce((a, b) => a + b, 0) / data.moods.length * 5 + 5).toFixed(1)),
        stress: Number((data.stresses.reduce((a, b) => a + b, 0) / data.stresses.length).toFixed(1)),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Create emotion data
    const emotionData = Object.entries(emotionCounts)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: EMOTION_COLORS[name] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Create stress data
    const stressData = [
      { name: 'Low', value: stressCounts.low, color: STRESS_COLORS.low },
      { name: 'Moderate', value: stressCounts.moderate, color: STRESS_COLORS.moderate },
      { name: 'High', value: stressCounts.high, color: STRESS_COLORS.high },
      { name: 'Severe', value: stressCounts.severe, color: STRESS_COLORS.severe },
    ];

    // Create balance data
    const total = positiveCount + neutralCount + negativeCount;
    const balanceData = [
      { 
        name: 'Positive', 
        value: positiveCount, 
        percentage: total ? ((positiveCount / total) * 100).toFixed(1) : '0'
      },
      { 
        name: 'Neutral', 
        value: neutralCount, 
        percentage: total ? ((neutralCount / total) * 100).toFixed(1) : '0'
      },
      { 
        name: 'Negative', 
        value: negativeCount, 
        percentage: total ? ((negativeCount / total) * 100).toFixed(1) : '0'
      },
    ];

    // Weekly comparison
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    const currentWeekEntries = entries.filter(e => new Date(e.createdAt) >= oneWeekAgo);
    const previousWeekEntries = entries.filter(
      e => new Date(e.createdAt) >= twoWeeksAgo && new Date(e.createdAt) < oneWeekAgo
    );
    
    const weeklyComparison = {
      currentWeek: currentWeekEntries.length,
      previousWeek: previousWeekEntries.length,
      change: previousWeekEntries.length 
        ? ((currentWeekEntries.length - previousWeekEntries.length) / previousWeekEntries.length) * 100
        : 0,
    };

    // Generate insights
    const insights = generateInsights(entries, baseStats, positiveCount, negativeCount, stressCounts);

    return {
      ...baseStats,
      trendData,
      emotionData,
      stressData,
      balanceData,
      weeklyComparison,
      insights,
    };
  };

  // Generate AI insights
  const generateInsights = (
    entries: JournalEntry[],
    stats: JournalStats,
    positiveCount: number,
    negativeCount: number,
    stressCounts: Record<string, number>
  ): string[] => {
    const insights: string[] = [];

    // Journaling consistency
    if (stats.streakDays >= 7) {
      insights.push(`You have maintained a ${stats.streakDays}-day journaling streak. That steady rhythm supports long-term awareness.`);
    } else if (stats.streakDays >= 3) {
      insights.push(`You're on a ${stats.streakDays}-day streak. Small, consistent check-ins are building momentum.`);
    } else if (stats.totalEntries > 0) {
      insights.push('A brief daily entry can make patterns easier to notice and support more grounded reflection.');
    }

    // Mood patterns
    if (positiveCount > negativeCount * 2) {
      insights.push('Your recent entries suggest more positive moments overall, which points to strong emotional recovery over time.');
    } else if (negativeCount > positiveCount) {
      insights.push('Recent entries show heavier days. It may help to lean on one stabilizing routine or a trusted person this week.');
    }

    // Stress analysis
    const highStress = stressCounts.high + stressCounts.severe;
    const lowStress = stressCounts.low;
    if (highStress > lowStress) {
      insights.push('Stress has been elevated lately. Gentle regulation practices like slower breathing or short pauses may help.');
    } else if (lowStress > highStress * 2) {
      insights.push('Your stress pattern looks relatively steady. Keep using the routines that are already working for you.');
    }

    // Word count insight
    if (stats.totalWords > 1000) {
      insights.push(`You have written ${stats.totalWords.toLocaleString()} words so far. Consistent expression is a strong foundation for reflection.`);
    }

    return insights.slice(0, 4);
  };

  // Render
  if (isLoading) {
    return (
      <div className="dashboard-shell min-h-screen dashboard-main p-6">
        <div className="max-w-7xl mx-auto">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!stats || stats.totalEntries === 0) {
    return (
      <div className="dashboard-shell min-h-screen dashboard-main p-6">
        <div className="max-w-7xl mx-auto">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell min-h-screen dashboard-main text-[var(--text-primary)] p-6 [font-family:Inter,sans-serif]">
      <div className="max-w-7xl mx-auto space-y-11">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="nav-title text-4xl leading-tight text-[var(--text-primary)]">
              Insights
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">Track your emotional journey and wellness trends</p>
          </div>
          
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            aria-label="Select dashboard time range"
            className="px-4 py-2 bg-[var(--card)] border border-[rgba(58,74,99,0.14)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[rgba(216,122,67,0.45)]"
          >
            {TIME_RANGES.map(range => (
              <option key={range.value} value={range.value} className="bg-[var(--card)]">
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* AI Insights - Primary */}
        {stats.insights.length > 0 && (
          <InsightCard insights={stats.insights} />
        )}

        {/* DASS-21 Results */}
        {dass21Results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-card-secondary rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--card)]">
                  <Brain className="w-4 h-4 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Your recent check-in</p>
                  <h3 className="nav-title text-[20px] leading-tight text-[var(--text-primary)]">DASS-21 Summary</h3>
                </div>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                Completed: {new Date(dass21Results.completedAt).toLocaleDateString()}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DASS21Card
                title="Depression"
                score={dass21Results.scores.depression}
                maxScore={42}
                level={dass21Results.severityLevels.depression.level}
                category="depression"
                icon={Heart}
              />
              <DASS21Card
                title="Anxiety"
                score={dass21Results.scores.anxiety}
                maxScore={42}
                level={dass21Results.severityLevels.anxiety.level}
                category="anxiety"
                icon={Zap}
              />
              <DASS21Card
                title="Stress"
                score={dass21Results.scores.stress}
                maxScore={42}
                level={dass21Results.severityLevels.stress.level}
                category="stress"
                icon={Activity}
              />
            </div>
            
            <p className="text-xs text-[var(--text-secondary)] mt-4 p-3 bg-[var(--card)] rounded-lg">
              <strong>Note:</strong> This check-in gives context for support suggestions. Your data stays private on your device.
            </p>
          </motion.div>
        )}

        {/* Key Metrics - Secondary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={BookOpen}
            label="Journal Entries"
            value={stats.totalEntries}
            subValue={`${stats.totalWords.toLocaleString()} words written`}
            color="blue"
          />
          <StatCard
            icon={Heart}
            label="Average Mood"
            value={`${((stats.averageMoodScore + 1) * 5).toFixed(1)}/10`}
            subValue={stats.averageMoodScore > 0 ? 'Mostly positive' : stats.averageMoodScore < 0 ? 'Needs attention' : 'Balanced'}
            trend={stats.averageMoodScore > 0.2 ? 'up' : stats.averageMoodScore < -0.2 ? 'down' : 'neutral'}
            color="green"
          />
          <StatCard
            icon={Flame}
            label="Current Streak"
            value={`${stats.streakDays} days`}
            subValue={stats.streakDays >= 7 ? 'Steady momentum' : 'Keep going'}
            trend={stats.streakDays >= 3 ? 'up' : 'neutral'}
            color="orange"
          />
          <StatCard
            icon={Target}
            label="Weekly Progress"
            value={stats.weeklyComparison.currentWeek}
            subValue={`${stats.weeklyComparison.change >= 0 ? '+' : ''}${stats.weeklyComparison.change.toFixed(0)}% vs last week`}
            trend={stats.weeklyComparison.change > 0 ? 'up' : stats.weeklyComparison.change < 0 ? 'down' : 'neutral'}
            color="purple"
          />
        </div>

        <div className="pt-1">
          <p className="text-sm text-[var(--text-secondary)] mb-5">Here&apos;s what your recent patterns look like</p>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mood Trend */}
          <ChartCard title="Mood Trend Over Time" icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats.trendData}>
                <defs>
                  <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d87a43" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#d87a43" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(58,74,99,0.07)" />
                <XAxis dataKey="date" stroke="#6f7f95" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="#6f7f95" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FBF7F2',
                    border: '1px solid rgba(58,74,99,0.08)',
                    borderRadius: '8px',
                    color: '#1F2A44',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="mood"
                  stroke="#C06A37"
                  strokeWidth={1.8}
                  fill="url(#moodGradient)"
                  name="Mood Score"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Emotion Distribution */}
          <ChartCard title="Emotion Distribution" icon={Heart}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.emotionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stats.emotionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FBF7F2',
                    border: '1px solid rgba(58,74,99,0.12)',
                    borderRadius: '8px',
                    color: '#1F2A44',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Stress Levels */}
          <ChartCard title="Stress Level Distribution" icon={Activity}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.stressData}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(58,74,99,0.07)" />
                <XAxis dataKey="name" stroke="#6f7f95" fontSize={12} />
                <YAxis stroke="#6f7f95" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FBF7F2',
                    border: '1px solid rgba(58,74,99,0.08)',
                    borderRadius: '8px',
                    color: '#1F2A44',
                  }}
                />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {stats.stressData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Emotional Balance */}
          <ChartCard title="Emotional Balance" icon={Target}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.balanceData} layout="vertical">
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(58,74,99,0.07)" />
                <XAxis type="number" stroke="#6f7f95" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#6f7f95" fontSize={12} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FBF7F2',
                    border: '1px solid rgba(58,74,99,0.08)',
                    borderRadius: '8px',
                    color: '#1F2A44',
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    `${value} entries (${props.payload.percentage}%)`,
                    name,
                  ]}
                />
                <Bar dataKey="value" name="Entries" radius={[0, 4, 4, 0]}>
                  <Cell fill={MOOD_COLORS.positive} />
                  <Cell fill={MOOD_COLORS.neutral} />
                  <Cell fill={MOOD_COLORS.negative} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          </div>
        </div>
      </div>
    </div>
  );
}
