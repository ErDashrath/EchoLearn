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
  tintClass: string;
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
    tintClass: 'bg-[rgba(232,180,160,0.2)]',
  },
  {
    id: 'json',
    name: 'JSON Export',
    description: 'Complete data export for backup or transfer',
    icon: FileJson,
    tintClass: 'bg-[rgba(201,217,184,0.2)]',
  },
  {
    id: 'csv',
    name: 'CSV Export',
    description: 'Spreadsheet-compatible format for analysis',
    icon: FileSpreadsheet,
    tintClass: 'bg-[rgba(183,201,214,0.2)]',
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
    whileHover={{ y: -2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onSelect}
    className={cn(
      'w-full p-4 rounded-xl text-left transition-all duration-200 border',
      format.tintClass,
      selected 
        ? 'border-[rgba(216,122,67,0.45)] shadow-[0_6px_14px_rgba(0,0,0,0.04)]' 
        : 'border-[rgba(58,74,99,0.12)] hover:shadow-[0_5px_12px_rgba(0,0,0,0.035)]'
    )}
  >
    <div className="flex items-start gap-4">
      <div className="p-3 rounded-lg bg-[var(--card)] border border-[rgba(58,74,99,0.08)]">
        <format.icon className="w-5 h-5 text-[var(--text-secondary)]" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[var(--text-primary)]">{format.name}</h3>
          {selected && <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />}
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{format.description}</p>
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
    'card-soft flex items-start gap-4 p-4 cursor-pointer transition-all',
    checked && !disabled ? 'bg-[var(--inner-strong)] border-l-[3px] border-l-[var(--accent)]' : '',
    disabled && 'opacity-50 cursor-not-allowed'
  )}>
    <div className="p-2 rounded-lg bg-[var(--card)] border border-[rgba(58,74,99,0.08)]">
      <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
    </div>
    <div className="flex-1">
      <div className="font-medium text-[var(--text-primary)]">{label}</div>
      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{description}</p>
    </div>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="w-5 h-5 rounded border-[rgba(58,74,99,0.35)] bg-[var(--card)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0"
    />
  </label>
));

OptionToggle.displayName = 'OptionToggle';

const StatsPreview = memo(({ stats, entries }: { stats: JournalStats | null; entries: JournalEntry[] }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="card-primary p-4 text-center shadow-[0_3px_10px_rgba(0,0,0,0.03)]">
        <BookOpen className="w-5 h-5 text-[var(--text-secondary)] mx-auto mb-2" />
        <div className="text-2xl font-semibold text-[var(--text-primary)]">{entries.length}</div>
        <div className="text-xs text-[var(--text-secondary)]">Entries to Export</div>
      </div>
      <div className="card-primary p-4 text-center shadow-[0_3px_10px_rgba(0,0,0,0.03)]">
        <FileText className="w-5 h-5 text-[var(--text-secondary)] mx-auto mb-2" />
        <div className="text-2xl font-semibold text-[var(--text-primary)]">{stats.totalWords.toLocaleString()}</div>
        <div className="text-xs text-[var(--text-secondary)]">Words Written</div>
      </div>
      <div className="card-primary p-4 text-center shadow-[0_3px_10px_rgba(0,0,0,0.03)]">
        <Activity className="w-5 h-5 text-[var(--text-secondary)] mx-auto mb-2" />
        <div className="text-2xl font-semibold text-[var(--text-primary)]">{((stats.averageMoodScore + 1) * 5).toFixed(1)}</div>
        <div className="text-xs text-[var(--text-secondary)]">Avg Mood Score</div>
      </div>
      <div className="card-primary p-4 text-center shadow-[0_3px_10px_rgba(0,0,0,0.03)]">
        <BarChart3 className="w-5 h-5 text-[var(--text-secondary)] mx-auto mb-2" />
        <div className="text-2xl font-semibold text-[var(--text-primary)]">{Object.keys(stats.emotionFrequency).length}</div>
        <div className="text-xs text-[var(--text-secondary)]">Unique Emotions</div>
      </div>
    </div>
  );
});

StatsPreview.displayName = 'StatsPreview';

const PrivacyNotice = memo(() => (
  <div className="card-emphasis flex items-start gap-3 p-4">
    <Shield className="w-5 h-5 text-[var(--text-secondary)]/80 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="font-medium text-[var(--text-primary)]">Privacy Notice</h4>
      <p className="text-sm text-[var(--text-secondary)] mt-1">
        Your exported data contains sensitive mental health information. Store it securely and 
        be cautious when sharing. All data is processed locally on your device.
      </p>
    </div>
  </div>
));

PrivacyNotice.displayName = 'PrivacyNotice';

const LoadingState = memo(() => (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mb-4" />
    <p className="text-[var(--text-secondary)]">Loading your data...</p>
  </div>
));

LoadingState.displayName = 'LoadingState';

const EmptyState = memo(() => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-16 text-center"
  >
    <div className="w-16 h-16 rounded-2xl bg-[var(--inner)] flex items-center justify-center mb-4 border border-[rgba(58,74,99,0.1)]">
      <FileText className="w-8 h-8 text-[var(--text-secondary)]" />
    </div>
    <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Data to Export</h2>
    <p className="text-[var(--text-secondary)] max-w-md">
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
    <div className="reports-shell reports-main min-h-screen text-[var(--text-primary)] p-6 [font-family:Inter,sans-serif]">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="nav-title text-4xl leading-tight text-[var(--text-primary)]">
            Reports & Export
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
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

            {/* Export Format Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-primary p-5 space-y-5"
            >
              <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Download className="w-5 h-5 text-[var(--text-secondary)]" />
                Choose Export Format
              </h2>

              <div className="card-soft p-4">
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
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
                  Date Range
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DATE_RANGES.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => setDateRange(range.value)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-all border border-transparent',
                        dateRange === range.value
                          ? 'bg-[var(--inner-strong)] text-[var(--accent)]'
                          : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--inner)]'
                      )}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats Preview */}
              {stats && <StatsPreview stats={stats} entries={entries} />}
            </motion.div>

            {/* PDF Options (only for PDF format) */}
            {selectedFormat === 'pdf' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card-primary p-5 space-y-4"
              >
                <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Info className="w-5 h-5 text-[var(--text-secondary)]" />
                  Report Options
                </h2>
                <div className="card-soft p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  'w-full md:w-auto px-8 py-3 text-lg font-semibold rounded-full transition-all text-white',
                  exportSuccess
                    ? 'bg-[#7A9B5E] hover:bg-[#6c8b54]'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-dark)]'
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
              
              <p className="text-sm text-[var(--text-secondary)] mt-3">
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
