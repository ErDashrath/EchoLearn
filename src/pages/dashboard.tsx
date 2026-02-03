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
  Brain,
  Heart,
  Zap,
  Target,
  Flame,
  BookOpen,
  Activity,
  CheckCircle2,
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
  happy: '#10b981',
  calm: '#3b82f6',
  grateful: '#8b5cf6',
  hopeful: '#06b6d4',
  anxious: '#f59e0b',
  sad: '#6366f1',
  stressed: '#ef4444',
  angry: '#dc2626',
  neutral: '#6b7280',
  mixed: '#a855f7',
};

const MOOD_COLORS = {
  positive: '#10b981',
  neutral: '#f59e0b',
  negative: '#ef4444',
};

const STRESS_COLORS = {
  low: '#10b981',
  moderate: '#f59e0b',
  high: '#f97316',
  severe: '#ef4444',
};

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
    blue: 'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-overlay-bg backdrop-blur-sm border border-overlay-border rounded-2xl p-5 hover:bg-overlay-bg-hover transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <Icon className="w-5 h-5 text-dark-text" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            trend === 'up' && 'bg-emerald-500/20 text-emerald-400',
            trend === 'down' && 'bg-red-500/20 text-red-400',
            trend === 'neutral' && 'bg-dark-border/20 text-dark-text-secondary'
          )}>
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'neutral' && <Minus className="w-3 h-3" />}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-dark-text">{value}</p>
        <p className="text-sm text-dark-text-secondary mt-1">{label}</p>
        {subValue && (
          <p className="text-xs text-dark-text-secondary mt-1">{subValue}</p>
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
      'bg-overlay-bg backdrop-blur-sm border border-overlay-border rounded-2xl p-6',
      className
    )}
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
        <Icon className="w-4 h-4 text-dark-text" />
      </div>
      <h3 className="text-lg font-semibold text-dark-text">{title}</h3>
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
  color,
  icon: Icon
}: {
  title: string;
  score: number;
  maxScore: number;
  level: string;
  color: string;
  icon: React.ElementType;
}) => {
  const percentage = (score / maxScore) * 100;
  const colorMap: Record<string, string> = {
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  const textColorMap: Record<string, string> = {
    green: 'text-emerald-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  };

  const bgColorMap: Record<string, string> = {
    green: 'bg-emerald-500/20',
    blue: 'bg-blue-500/20',
    yellow: 'bg-yellow-500/20',
    orange: 'bg-orange-500/20',
    red: 'bg-red-500/20',
  };

  return (
    <div className="bg-overlay-bg backdrop-blur-sm border border-overlay-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-5 h-5', textColorMap[color])} />
          <span className="font-medium text-dark-text">{title}</span>
        </div>
        <span className={cn(
          'px-2.5 py-1 rounded-full text-xs font-medium',
          bgColorMap[color],
          textColorMap[color]
        )}>
          {level}
        </span>
      </div>
      <div className="text-3xl font-bold text-dark-text mb-2">{score}</div>
      <div className="h-2 bg-overlay-border rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all duration-500', colorMap[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-dark-text-secondary mt-2">Score range: 0-{maxScore}</p>
    </div>
  );
});

DASS21Card.displayName = 'DASS21Card';

const InsightCard = memo(({ insights }: { insights: string[] }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6"
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
        <Sparkles className="w-4 h-4 text-dark-text" />
      </div>
      <h3 className="text-lg font-semibold text-dark-text">AI Insights</h3>
    </div>
    <div className="space-y-3">
      {insights.map((insight, index) => (
        <div key={index} className="flex items-start gap-3 p-3 bg-overlay-bg rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-dark-text-secondary">{insight}</p>
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
        <div key={i} className="h-32 bg-overlay-bg rounded-2xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-80 bg-overlay-bg rounded-2xl" />
      <div className="h-80 bg-overlay-bg rounded-2xl" />
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
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
      <BarChart3 className="w-10 h-10 text-blue-400" />
    </div>
    <h2 className="text-2xl font-bold text-dark-text mb-2">No Data Yet</h2>
    <p className="text-dark-text-secondary max-w-md mb-6">
      Start journaling to see your mental health insights and trends. Your dashboard will come to life as you track your emotional journey.
    </p>
    <Button 
      onClick={() => window.location.href = '/journal'}
      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90"
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
    const insights = generateInsights(baseStats, positiveCount, negativeCount, stressCounts);

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
    stats: JournalStats,
    positiveCount: number,
    negativeCount: number,
    stressCounts: Record<string, number>
  ): string[] => {
    const insights: string[] = [];

    // Journaling consistency
    if (stats.streakDays >= 7) {
      insights.push(`🔥 Amazing! You've maintained a ${stats.streakDays}-day journaling streak. Keep it up!`);
    } else if (stats.streakDays >= 3) {
      insights.push(`📝 Great progress! You're on a ${stats.streakDays}-day streak. Consistency is key!`);
    } else if (stats.totalEntries > 0) {
      insights.push('💪 Try journaling daily to build a healthy habit and track patterns better.');
    }

    // Mood patterns
    if (positiveCount > negativeCount * 2) {
      insights.push('😊 Your overall mood has been predominantly positive. Your emotional resilience is strong!');
    } else if (negativeCount > positiveCount) {
      insights.push('💙 You\'ve had some challenging days. Remember, it\'s okay to feel this way. Consider talking to someone you trust.');
    }

    // Stress analysis
    const highStress = stressCounts.high + stressCounts.severe;
    const lowStress = stressCounts.low;
    if (highStress > lowStress) {
      insights.push('🧘 Higher stress levels detected. Consider incorporating relaxation techniques like deep breathing or meditation.');
    } else if (lowStress > highStress * 2) {
      insights.push('✨ Your stress management is excellent! Keep up with whatever strategies are working for you.');
    }

    // Word count insight
    if (stats.totalWords > 1000) {
      insights.push(`📖 You've written ${stats.totalWords.toLocaleString()} words in your journal. Self-expression is a powerful tool for mental health!`);
    }

    return insights.slice(0, 4);
  };

  // Render
  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg p-6">
        <div className="max-w-7xl mx-auto">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!stats || stats.totalEntries === 0) {
    return (
      <div className="min-h-screen bg-dark-bg p-6">
        <div className="max-w-7xl mx-auto">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Mental Health Dashboard
            </h1>
            <p className="text-dark-text-secondary mt-1">Track your emotional journey and wellness trends</p>
          </div>
          
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-4 py-2 bg-overlay-bg border border-overlay-border rounded-lg text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIME_RANGES.map(range => (
              <option key={range.value} value={range.value} className="bg-dark-bg-secondary">
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* DASS-21 Results */}
        {dass21Results && dass21Results.severityLevels && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">DASS-21 Baseline Assessment</h3>
              </div>
              <span className="text-sm text-dark-text-secondary">
                Completed: {new Date(dass21Results.completedAt).toLocaleDateString()}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DASS21Card
                title="Depression"
                score={dass21Results.scores.depression}
                maxScore={42}
                level={dass21Results.severityLevels.depression?.level}
                color={dass21Results.severityLevels.depression?.color}
                icon={Heart}
              />
              <DASS21Card
                title="Anxiety"
                score={dass21Results.scores.anxiety}
                maxScore={42}
                level={dass21Results.severityLevels.anxiety?.level}
                color={dass21Results.severityLevels.anxiety?.color}
                icon={Zap}
              />
              <DASS21Card
                title="Stress"
                score={dass21Results.scores.stress}
                maxScore={42}
                level={dass21Results.severityLevels.stress?.level}
                color={dass21Results.severityLevels.stress?.color}
                icon={Activity}
              />
            </div>
            
            <p className="text-sm text-dark-text-secondary mt-4 p-3 bg-overlay-bg rounded-lg">
              <strong>Note:</strong> This baseline helps MindScribe provide personalized support. Your data is private and stored securely on your device.
            </p>
          </motion.div>
        )}

        {/* Stats Overview */}
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
            subValue={stats.streakDays >= 7 ? 'On fire! 🔥' : 'Keep going!'}
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

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mood Trend */}
          <ChartCard title="Mood Trend Over Time" icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats.trendData}>
                <defs>
                  <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="mood"
                  stroke="#3b82f6"
                  strokeWidth={2}
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
                  label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stats.emotionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stress Levels */}
          <ChartCard title="Stress Level Distribution" icon={Activity}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.stressData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
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
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#6b7280" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={12} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={((value: number | undefined, name: string | undefined, props: any) => {
                    const numValue = value ?? 0;
                    return [`${numValue} entries (${props.payload.percentage}%)`, name ?? ''];
                  }) as any}
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

        {/* AI Insights */}
        {stats.insights.length > 0 && (
          <InsightCard insights={stats.insights} />
        )}
      </div>
    </div>
  );
}
