/**
 * F026-F027: Reports & Export Page
 * 
 * Features:
 * - F026: Generate PDF mental health summary
 * - F027: Export data as JSON/CSV
 * 
 * Following skills.sh guidelines:
 * - Vercel React Best Practices
 * - Anthropic Frontend Design Patterns
 * 
 * @module pages/reports
 */

import React, { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  FileJson,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
  Brain,
  BookOpen,
  Activity,
  BarChart3,
  Info,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { journalService, type JournalEntry, type JournalStats } from '@/services/journal-service';
import { reportService, type ReportOptions, type ReportData, type DASS21Data } from '@/services/report-service';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface ExportFormat {
  id: 'pdf' | 'json' | 'csv';
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'pdf',
    name: 'PDF Report',
    description: 'Comprehensive mental health summary with charts and analysis',
    icon: FileText,
    color: 'from-red-500 to-red-600',
  },
  {
    id: 'json',
    name: 'JSON Export',
    description: 'Complete data export for backup or transfer',
    icon: FileJson,
    color: 'from-yellow-500 to-orange-500',
  },
  {
    id: 'csv',
    name: 'CSV Export',
    description: 'Spreadsheet-compatible format for analysis',
    icon: FileSpreadsheet,
    color: 'from-green-500 to-emerald-600',
  },
];

const DATE_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 3 months' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last year' },
  { value: 0, label: 'All time' },
];

// =============================================================================
// MEMOIZED COMPONENTS
// =============================================================================

const FormatCard = memo(({ 
  format, 
  selected, 
  onSelect 
}: { 
  format: ExportFormat; 
  selected: boolean;
  onSelect: () => void;
}) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onSelect}
    className={cn(
      'w-full p-4 rounded-xl border-2 text-left transition-all',
      selected 
        ? 'border-blue-500 bg-blue-500/10' 
        : 'border-overlay-border bg-overlay-bg hover:border-overlay-bg-hover'
    )}
  >
    <div className="flex items-start gap-4">
      <div className={cn('p-3 rounded-lg bg-gradient-to-br', format.color)}>
        <format.icon className="w-5 h-5 text-dark-text" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-dark-text">{format.name}</h3>
          {selected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
        </div>
        <p className="text-sm text-dark-text-secondary mt-1">{format.description}</p>
      </div>
    </div>
  </motion.button>
));

FormatCard.displayName = 'FormatCard';

const OptionToggle = memo(({ 
  icon: Icon,
  label, 
  description,
  checked, 
  onChange,
  disabled = false
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <label className={cn(
    'flex items-start gap-4 p-4 rounded-xl border border-white/10 cursor-pointer transition-all',
    checked && !disabled ? 'bg-overlay-bg border-blue-500/50' : 'bg-overlay-bg/50',
    disabled && 'opacity-50 cursor-not-allowed'
  )}>
    <div className="p-2 rounded-lg bg-overlay-bg">
      <Icon className="w-4 h-4 text-dark-text-secondary" />
    </div>
    <div className="flex-1">
      <div className="font-medium text-dark-text">{label}</div>
      <p className="text-sm text-dark-text-secondary mt-0.5">{description}</p>
    </div>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="w-5 h-5 rounded border-dark-border bg-overlay-bg text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
    />
  </label>
));

OptionToggle.displayName = 'OptionToggle';

const StatsPreview = memo(({ stats, entries }: { stats: JournalStats | null; entries: JournalEntry[] }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-overlay-bg rounded-xl p-4 text-center">
        <BookOpen className="w-5 h-5 text-blue-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-dark-text">{entries.length}</div>
        <div className="text-xs text-dark-text-secondary">Entries to Export</div>
      </div>
      <div className="bg-overlay-bg rounded-xl p-4 text-center">
        <FileText className="w-5 h-5 text-purple-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-dark-text">{stats.totalWords.toLocaleString()}</div>
        <div className="text-xs text-dark-text-secondary">Words Written</div>
      </div>
      <div className="bg-overlay-bg rounded-xl p-4 text-center">
        <Activity className="w-5 h-5 text-pink-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-dark-text">{((stats.averageMoodScore + 1) * 5).toFixed(1)}</div>
        <div className="text-xs text-dark-text-secondary">Avg Mood</div>
      </div>
      <div className="bg-overlay-bg rounded-xl p-4 text-center">
        <BarChart3 className="w-5 h-5 text-orange-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-dark-text">{Object.keys(stats.emotionFrequency).length}</div>
        <div className="text-xs text-dark-text-secondary">Unique Emotions</div>
      </div>
    </div>
  );
});

StatsPreview.displayName = 'StatsPreview';

const PrivacyNotice = memo(() => (
  <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/20 rounded-xl">
    <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="font-medium text-yellow-800 dark:text-yellow-300">Privacy Notice</h4>
      <p className="text-sm text-yellow-700 dark:text-yellow-200/70 mt-1">
        Your exported data contains sensitive mental health information. Store it securely and 
        be cautious when sharing. All data is processed locally on your device.
      </p>
    </div>
  </div>
));

PrivacyNotice.displayName = 'PrivacyNotice';

const LoadingState = memo(() => (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
    <p className="text-dark-text-secondary">Loading your data...</p>
  </div>
));

LoadingState.displayName = 'LoadingState';

const EmptyState = memo(() => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-16 text-center"
  >
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-4">
      <FileText className="w-8 h-8 text-blue-400" />
    </div>
    <h2 className="text-xl font-bold text-dark-text mb-2">No Data to Export</h2>
    <p className="text-dark-text-secondary max-w-md">
      Start journaling to generate reports. Your entries and analysis will appear here once you begin tracking your mental health journey.
    </p>
  </motion.div>
));

EmptyState.displayName = 'EmptyState';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ReportsPage() {
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'json' | 'csv'>('pdf');
  const [dateRange, setDateRange] = useState(30);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [dass21Data, setDass21Data] = useState<DASS21Data | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  
  const [options, setOptions] = useState<ReportOptions>({
    includeJournalEntries: true,
    includeDASS21: true,
    includeMoodAnalysis: true,
    includeStressAnalysis: true,
  });

  const { user, getDASS21Results, hasCompletedDASS21 } = useAuth();

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      
      setIsLoading(true);
      
      try {
        journalService.setUserId(user.username);
        
        // Load entries and stats
        const allEntries = await journalService.getAllEntries();
        const journalStats = await journalService.getStats();
        
        // Filter by date range
        const cutoffDate = dateRange > 0 
          ? new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000)
          : new Date(0);
        
        const filteredEntries = allEntries.filter(
          e => new Date(e.createdAt) >= cutoffDate
        );
        
        setEntries(filteredEntries);
        setStats(journalStats);
        
        // Load DASS-21
        if (hasCompletedDASS21) {
          const results = await getDASS21Results();
          setDass21Data(results);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [user, dateRange, hasCompletedDASS21, getDASS21Results]);

  // Handle export
  const handleExport = async () => {
    if (!user || !stats) return;
    
    setIsExporting(true);
    setExportSuccess(false);
    
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      
      if (selectedFormat === 'pdf') {
        // Generate PDF
        const reportData: ReportData = {
          userName: user.name || user.username,
          generatedAt: now.toISOString(),
          dateRange: {
            start: dateRange > 0 
              ? new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toLocaleDateString()
              : 'Beginning',
            end: now.toLocaleDateString(),
          },
          stats,
          entries,
          dass21: dass21Data || undefined,
        };
        
        const pdfBlob = await reportService.generatePDFReport(reportData, options);
        reportService.downloadFile(pdfBlob, `mindscribe-report-${dateStr}.pdf`, 'application/pdf');
      } else if (selectedFormat === 'json') {
        // Export JSON
        const jsonContent = await reportService.exportAsJSON(entries, stats);
        reportService.downloadFile(jsonContent, `mindscribe-export-${dateStr}.json`, 'application/json');
      } else {
        // Export CSV
        const csvContent = await reportService.exportAsCSV(entries);
        reportService.downloadFile(csvContent, `mindscribe-export-${dateStr}.csv`, 'text/csv');
      }
      
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Render
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Reports & Export
          </h1>
          <p className="text-dark-text-secondary mt-2">
            Generate comprehensive reports or export your data for backup and analysis
          </p>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : entries.length === 0 && !dass21Data ? (
          <EmptyState />
        ) : (
          <>
            {/* Privacy Notice */}
            <PrivacyNotice />

            {/* Stats Preview */}
            {stats && <StatsPreview stats={stats} entries={entries} />}

            {/* Export Format Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold text-dark-text flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" />
                Choose Export Format
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {EXPORT_FORMATS.map((format) => (
                  <FormatCard
                    key={format.id}
                    format={format}
                    selected={selectedFormat === format.id}
                    onSelect={() => setSelectedFormat(format.id)}
                  />
                ))}
              </div>
            </motion.div>

            {/* Date Range */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold text-dark-text flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                Date Range
              </h2>
              <div className="flex flex-wrap gap-2">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setDateRange(range.value)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      dateRange === range.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-overlay-bg text-dark-text-secondary hover:bg-overlay-bg-hover'
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* PDF Options (only for PDF format) */}
            {selectedFormat === 'pdf' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-semibold text-dark-text flex items-center gap-2">
                  <Info className="w-5 h-5 text-green-400" />
                  Report Options
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OptionToggle
                    icon={BookOpen}
                    label="Journal Entries"
                    description="Include summary table of journal entries"
                    checked={options.includeJournalEntries}
                    onChange={(checked) => setOptions(o => ({ ...o, includeJournalEntries: checked }))}
                  />
                  <OptionToggle
                    icon={Brain}
                    label="DASS-21 Assessment"
                    description="Include baseline mental health assessment"
                    checked={options.includeDASS21}
                    onChange={(checked) => setOptions(o => ({ ...o, includeDASS21: checked }))}
                    disabled={!dass21Data}
                  />
                  <OptionToggle
                    icon={Activity}
                    label="Mood Analysis"
                    description="Include mood distribution and trends"
                    checked={options.includeMoodAnalysis}
                    onChange={(checked) => setOptions(o => ({ ...o, includeMoodAnalysis: checked }))}
                  />
                  <OptionToggle
                    icon={AlertTriangle}
                    label="Stress Analysis"
                    description="Include stress level breakdown"
                    checked={options.includeStressAnalysis}
                    onChange={(checked) => setOptions(o => ({ ...o, includeStressAnalysis: checked }))}
                  />
                </div>
              </motion.div>
            )}

            {/* Export Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pt-4"
            >
              <Button
                onClick={handleExport}
                disabled={isExporting || (entries.length === 0 && !dass21Data)}
                className={cn(
                  'w-full md:w-auto px-8 py-3 text-lg font-semibold rounded-xl transition-all',
                  exportSuccess
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90'
                )}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : exportSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Downloaded Successfully!
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Export {selectedFormat.toUpperCase()}
                  </>
                )}
              </Button>
              
              <p className="text-sm text-dark-text-secondary mt-3">
                {selectedFormat === 'pdf' && 'PDF report includes visual summaries and is best for sharing with healthcare providers.'}
                {selectedFormat === 'json' && 'JSON export contains complete data structure and is best for backup or data migration.'}
                {selectedFormat === 'csv' && 'CSV export can be opened in Excel or Google Sheets for custom analysis.'}
              </p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
