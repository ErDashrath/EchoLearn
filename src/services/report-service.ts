/**
 * F026-F027: Report & Export Service
 * 
 * Handles:
 * - PDF report generation with mental health summary
 * - Data export as JSON/CSV
 * 
 * @module services/report-service
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { JournalEntry, JournalStats } from './journal-service';

// =============================================================================
// TYPES
// =============================================================================

export interface ReportOptions {
  includeJournalEntries: boolean;
  includeDASS21: boolean;
  includeMoodAnalysis: boolean;
  includeStressAnalysis: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface DASS21Data {
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

export interface ReportData {
  userName: string;
  generatedAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  stats: JournalStats;
  entries: JournalEntry[];
  dass21?: DASS21Data;
}

// =============================================================================
// REPORT SERVICE CLASS
// =============================================================================

class ReportService {
  /**
   * Generate PDF mental health report
   */
  async generatePDFReport(
    data: ReportData,
    options: ReportOptions
  ): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Helper function to add new page if needed
    const checkNewPage = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
        return true;
      }
      return false;
    };

    // =========================================================================
    // HEADER
    // =========================================================================
    
    // Title
    doc.setFillColor(59, 130, 246); // Blue
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('MindScribe', 20, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Mental Health Report', 20, 35);
    
    // User info on right
    doc.setFontSize(10);
    doc.text(`Generated for: ${data.userName}`, pageWidth - 20, 20, { align: 'right' });
    doc.text(`Date: ${new Date(data.generatedAt).toLocaleDateString()}`, pageWidth - 20, 28, { align: 'right' });
    doc.text(`Period: ${data.dateRange.start} - ${data.dateRange.end}`, pageWidth - 20, 36, { align: 'right' });
    
    yPos = 55;
    doc.setTextColor(0, 0, 0);

    // =========================================================================
    // SUMMARY SECTION
    // =========================================================================
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text('📊 Summary Overview', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);

    // Summary stats table
    const summaryData = [
      ['Total Journal Entries', data.stats.totalEntries.toString()],
      ['Total Words Written', data.stats.totalWords.toLocaleString()],
      ['Average Mood Score', `${((data.stats.averageMoodScore + 1) * 5).toFixed(1)}/10`],
      ['Average Stress Level', `${data.stats.averageStressScore.toFixed(1)}/10`],
      ['Current Streak', `${data.stats.streakDays} days`],
      ['Last Entry', data.stats.lastEntryDate 
        ? new Date(data.stats.lastEntryDate).toLocaleDateString() 
        : 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 20, right: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // =========================================================================
    // DASS-21 SECTION
    // =========================================================================
    
    if (options.includeDASS21 && data.dass21) {
      checkNewPage(80);
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(139, 92, 246); // Purple
      doc.text('🧠 DASS-21 Baseline Assessment', 20, yPos);
      yPos += 5;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`Completed: ${new Date(data.dass21.completedAt).toLocaleDateString()}`, 20, yPos + 5);
      yPos += 10;

      const dass21Data = [
        [
          'Depression', 
          data.dass21.scores.depression.toString(), 
          data.dass21.severityLevels.depression.level,
          '0-42'
        ],
        [
          'Anxiety', 
          data.dass21.scores.anxiety.toString(), 
          data.dass21.severityLevels.anxiety.level,
          '0-42'
        ],
        [
          'Stress', 
          data.dass21.scores.stress.toString(), 
          data.dass21.severityLevels.stress.level,
          '0-42'
        ],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['Category', 'Score', 'Severity', 'Range']],
        body: dass21Data,
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246] },
        margin: { left: 20, right: 20 },
        columnStyles: {
          2: { 
            fontStyle: 'bold',
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // DASS-21 interpretation note
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      const noteText = 'Note: DASS-21 is a screening tool. Higher scores indicate more severe symptoms. ' +
        'Please consult a mental health professional for clinical interpretation.';
      const splitNote = doc.splitTextToSize(noteText, pageWidth - 40);
      doc.text(splitNote, 20, yPos);
      yPos += splitNote.length * 5 + 10;
    }

    // =========================================================================
    // MOOD DISTRIBUTION SECTION
    // =========================================================================
    
    if (options.includeMoodAnalysis && Object.keys(data.stats.moodDistribution).length > 0) {
      checkNewPage(60);
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129); // Green
      doc.text('😊 Mood Distribution', 20, yPos);
      yPos += 10;

      const moodData = Object.entries(data.stats.moodDistribution).map(([mood, count]) => [
        mood.charAt(0).toUpperCase() + mood.slice(1),
        count.toString(),
        `${((count / data.stats.totalEntries) * 100).toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Mood', 'Count', 'Percentage']],
        body: moodData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        margin: { left: 20, right: 20 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // =========================================================================
    // EMOTION FREQUENCY SECTION
    // =========================================================================
    
    if (options.includeMoodAnalysis && Object.keys(data.stats.emotionFrequency).length > 0) {
      checkNewPage(80);
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(245, 158, 11); // Amber
      doc.text('🎭 Top Emotions', 20, yPos);
      yPos += 10;

      const emotionData = Object.entries(data.stats.emotionFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([emotion, count], index) => [
          (index + 1).toString(),
          emotion.charAt(0).toUpperCase() + emotion.slice(1),
          count.toString()
        ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Rank', 'Emotion', 'Frequency']],
        body: emotionData,
        theme: 'striped',
        headStyles: { fillColor: [245, 158, 11] },
        margin: { left: 20, right: 20 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // =========================================================================
    // JOURNAL ENTRIES SECTION
    // =========================================================================
    
    if (options.includeJournalEntries && data.entries.length > 0) {
      checkNewPage(40);
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(99, 102, 241); // Indigo
      doc.text('📝 Journal Entries Summary', 20, yPos);
      yPos += 10;

      const entriesData = data.entries.slice(0, 20).map(entry => [
        new Date(entry.createdAt).toLocaleDateString(),
        entry.title.substring(0, 30) + (entry.title.length > 30 ? '...' : ''),
        entry.analysis?.mood || 'N/A',
        entry.analysis?.stressLevel || 'N/A',
        entry.wordCount.toString()
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Title', 'Mood', 'Stress', 'Words']],
        body: entriesData,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
        margin: { left: 20, right: 20 },
        columnStyles: {
          1: { cellWidth: 60 }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      if (data.entries.length > 20) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(`Showing 20 of ${data.entries.length} entries. Export as JSON/CSV for complete data.`, 20, yPos);
        yPos += 10;
      }
    }

    // =========================================================================
    // FOOTER
    // =========================================================================
    
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} | Generated by MindScribe | ${new Date().toISOString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // =========================================================================
    // DISCLAIMER
    // =========================================================================
    
    doc.addPage();
    yPos = 30;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(239, 68, 68); // Red
    doc.text('⚠️ Important Disclaimer', 20, yPos);
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    
    const disclaimerText = [
      'This report is generated by MindScribe, a mental health journaling application designed for personal wellness tracking and self-reflection.',
      '',
      '• This report is NOT a medical diagnosis or professional mental health assessment.',
      '• The DASS-21 scores are screening indicators only, not clinical diagnoses.',
      '• AI-generated mood and emotion analyses are approximations based on text analysis.',
      '• This data should not replace professional mental health consultation.',
      '',
      'If you are experiencing mental health difficulties, please reach out to:',
      '• A licensed mental health professional',
      '• Your primary care physician',
      '• Mental health helplines in your area',
      '',
      'In case of emergency or crisis, please contact emergency services immediately.',
      '',
      'Data Privacy: All data in this report was stored locally on your device and has been exported at your request. MindScribe does not store your personal data on external servers.'
    ];

    disclaimerText.forEach(line => {
      const splitLine = doc.splitTextToSize(line, pageWidth - 40);
      doc.text(splitLine, 20, yPos);
      yPos += splitLine.length * 5 + (line === '' ? 3 : 0);
    });

    // Return as blob
    return doc.output('blob');
  }

  /**
   * Export journal data as JSON
   */
  async exportAsJSON(entries: JournalEntry[], stats: JournalStats): Promise<string> {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      statistics: stats,
      entries: entries.map(entry => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        wordCount: entry.wordCount,
        tags: entry.tags,
        isFavorite: entry.isFavorite,
        analysis: entry.analysis ? {
          mood: entry.analysis.mood,
          moodScore: entry.analysis.moodScore,
          sentimentScore: entry.analysis.sentimentScore,
          emotions: entry.analysis.emotions,
          stressLevel: entry.analysis.stressLevel,
          stressScore: entry.analysis.stressScore,
          themes: entry.analysis.themes,
          summary: entry.analysis.summary,
          analyzedAt: entry.analysis.analyzedAt,
        } : null,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export journal data as CSV
   */
  async exportAsCSV(entries: JournalEntry[]): Promise<string> {
    const headers = [
      'ID',
      'Title',
      'Date Created',
      'Date Updated',
      'Word Count',
      'Tags',
      'Favorite',
      'Mood',
      'Mood Score',
      'Sentiment Score',
      'Emotions',
      'Stress Level',
      'Stress Score',
      'Themes',
      'Summary',
      'Content'
    ];

    const rows = entries.map(entry => [
      entry.id,
      this.escapeCSV(entry.title),
      entry.createdAt,
      entry.updatedAt,
      entry.wordCount.toString(),
      entry.tags.join('; '),
      entry.isFavorite ? 'Yes' : 'No',
      entry.analysis?.mood || '',
      entry.analysis?.moodScore?.toString() || '',
      entry.analysis?.sentimentScore?.toString() || '',
      entry.analysis?.emotions?.join('; ') || '',
      entry.analysis?.stressLevel || '',
      entry.analysis?.stressScore?.toString() || '',
      entry.analysis?.themes?.join('; ') || '',
      this.escapeCSV(entry.analysis?.summary || ''),
      this.escapeCSV(entry.content),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Escape CSV special characters
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Trigger file download
   */
  downloadFile(content: Blob | string, filename: string, mimeType: string): void {
    const blob = content instanceof Blob 
      ? content 
      : new Blob([content], { type: mimeType });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Export singleton instance
export const reportService = new ReportService();
