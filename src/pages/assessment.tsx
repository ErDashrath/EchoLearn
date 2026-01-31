/**
 * F005: DASS-21 Assessment - Depression, Anxiety, Stress Scale
 * 
 * Features:
 * - 21-question standardized assessment
 * - Section-by-section flow (Depression, Anxiety, Stress)
 * - Real-time progress tracking
 * - Severity level calculation
 * - Animated transitions with Framer Motion
 * 
 * @module pages/assessment
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Heart,
  Zap,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface Question {
  id: number;
  text: string;
}

interface Section {
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  questions: Question[];
}

interface ScaleOption {
  value: number;
  label: string;
  short: string;
}

interface SeverityLevel {
  max: number;
  level: string;
  color: string;
  bgClass: string;
  textClass: string;
}

interface AssessmentResults {
  scores: {
    depression: number;
    anxiety: number;
    stress: number;
  };
  severityLevels: {
    depression: SeverityLevel;
    anxiety: SeverityLevel;
    stress: SeverityLevel;
  };
  responses: Record<number, number>;
  completedAt: string;
}

// =============================================================================
// DATA
// =============================================================================

const sections: Section[] = [
  {
    name: 'Depression',
    description: 'Questions about emotional state and motivation',
    icon: Heart,
    color: 'blue',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    questions: [
      { id: 3, text: "I couldn't seem to experience any positive feeling at all" },
      { id: 5, text: 'I found it difficult to work up the initiative to do things' },
      { id: 10, text: 'I felt that I had nothing to look forward to' },
      { id: 13, text: 'I felt down-hearted and blue' },
      { id: 16, text: 'I was unable to become enthusiastic about anything' },
      { id: 17, text: "I felt I wasn't worth much as a person" },
      { id: 21, text: 'I felt that life was meaningless' },
    ],
  },
  {
    name: 'Anxiety',
    description: 'Questions about worry and physical symptoms',
    icon: Zap,
    color: 'amber',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    questions: [
      { id: 2, text: 'I was aware of dryness of my mouth' },
      { id: 4, text: 'I experienced breathing difficulty (e.g., excessively rapid breathing, breathlessness)' },
      { id: 7, text: 'I experienced trembling (e.g., in the hands)' },
      { id: 9, text: 'I was worried about situations in which I might panic and make a fool of myself' },
      { id: 15, text: 'I felt I was close to panic' },
      { id: 19, text: 'I was aware of the action of my heart in the absence of physical exertion (e.g., sense of heart rate increase, heart missing a beat)' },
      { id: 20, text: 'I felt scared without any good reason' },
    ],
  },
  {
    name: 'Stress',
    description: 'Questions about tension and irritability',
    icon: Flame,
    color: 'rose',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30',
    borderColor: 'border-rose-200 dark:border-rose-800',
    questions: [
      { id: 1, text: 'I found it hard to wind down' },
      { id: 6, text: 'I tended to over-react to situations' },
      { id: 8, text: 'I felt that I was using a lot of nervous energy' },
      { id: 11, text: 'I found myself getting agitated' },
      { id: 12, text: 'I found it difficult to relax' },
      { id: 14, text: 'I was intolerant of anything that kept me from getting on with what I was doing' },
      { id: 18, text: 'I felt that I was rather touchy' },
    ],
  },
];

const scaleOptions: ScaleOption[] = [
  { value: 0, label: 'Did not apply to me at all', short: 'Not at all' },
  { value: 1, label: 'Applied to me to some degree, or some of the time', short: 'Sometimes' },
  { value: 2, label: 'Applied to me to a considerable degree, or a good part of time', short: 'Often' },
  { value: 3, label: 'Applied to me very much, or most of the time', short: 'Almost Always' },
];

const severityRanges: Record<string, SeverityLevel[]> = {
  depression: [
    { max: 9, level: 'Normal', color: 'green', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
    { max: 13, level: 'Mild', color: 'blue', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
    { max: 20, level: 'Moderate', color: 'yellow', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
    { max: 27, level: 'Severe', color: 'orange', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-400' },
    { max: Infinity, level: 'Extremely Severe', color: 'red', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  ],
  anxiety: [
    { max: 7, level: 'Normal', color: 'green', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
    { max: 9, level: 'Mild', color: 'blue', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
    { max: 14, level: 'Moderate', color: 'yellow', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
    { max: 19, level: 'Severe', color: 'orange', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-400' },
    { max: Infinity, level: 'Extremely Severe', color: 'red', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  ],
  stress: [
    { max: 14, level: 'Normal', color: 'green', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
    { max: 18, level: 'Mild', color: 'blue', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
    { max: 25, level: 'Moderate', color: 'yellow', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
    { max: 33, level: 'Severe', color: 'orange', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-400' },
    { max: Infinity, level: 'Extremely Severe', color: 'red', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  ],
};

// =============================================================================
// COMPONENT
// =============================================================================

const AssessmentPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const { user, setHasCompletedDASS21, saveDASS21Results, getDASS21Results } = useAuth();
  
  const [currentSection, setCurrentSection] = useState(0);
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [showInstructions, setShowInstructions] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<AssessmentResults | null>(null);
  const [previousResults, setPreviousResults] = useState<AssessmentResults | null>(null);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(true);

  // Check for previous assessment results on mount
  React.useEffect(() => {
    const loadPreviousResults = async () => {
      try {
        const existing = await getDASS21Results();
        if (existing) {
          setPreviousResults(existing);
        }
      } catch (error) {
        console.error('Failed to load previous results:', error);
      } finally {
        setIsLoadingPrevious(false);
      }
    };
    loadPreviousResults();
  }, [getDASS21Results]);

  // Calculate progress
  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);
  const answeredQuestions = Object.keys(responses).length;
  const progressPercentage = (answeredQuestions / totalQuestions) * 100;

  const handleResponse = (questionId: number, value: number) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const isCurrentSectionComplete = () => {
    const currentQuestions = sections[currentSection].questions;
    return currentQuestions.every(q => responses[q.id] !== undefined);
  };

  const handleSkipToChat = () => {
    setLocation('/');
  };

  const getSeverityLevel = (score: number, type: string): SeverityLevel => {
    const ranges = severityRanges[type];
    return ranges.find(range => score <= range.max) || ranges[ranges.length - 1];
  };

  const calculateScores = () => {
    let depression = 0;
    let anxiety = 0;
    let stress = 0;

    sections[0].questions.forEach(q => { depression += responses[q.id] || 0; });
    sections[1].questions.forEach(q => { anxiety += responses[q.id] || 0; });
    sections[2].questions.forEach(q => { stress += responses[q.id] || 0; });

    // Multiply by 2 to get DASS-21 scores (aligned with DASS-42)
    return {
      depression: depression * 2,
      anxiety: anxiety * 2,
      stress: stress * 2,
    };
  };

  const handleNext = async () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    } else {
      // Complete assessment
      const scores = calculateScores();
      const assessmentResults: AssessmentResults = {
        scores,
        severityLevels: {
          depression: getSeverityLevel(scores.depression, 'depression'),
          anxiety: getSeverityLevel(scores.anxiety, 'anxiety'),
          stress: getSeverityLevel(scores.stress, 'stress'),
        },
        responses,
        completedAt: new Date().toISOString(),
      };
      setResults(assessmentResults);
      setShowResults(true);
      setHasCompletedDASS21(true);
      
      // Save to persistent storage
      const saved = await saveDASS21Results(assessmentResults);
      if (saved) {
        toast({
          title: 'Assessment saved successfully',
          description: 'Your results will personalize your AI experience.',
        });
      } else {
        toast({
          title: 'Failed to save assessment',
          description: 'Your results are available but may not persist after refresh.',
          variant: 'destructive',
        });
      }
    }
  };

  const handlePrevious = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const handleContinueToApp = () => {
    setLocation('/');
  };

  // =============================================================================
  // RENDER: Instructions
  // =============================================================================

  if (showInstructions) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl"
        >
          <Card className="border-0 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="text-center pb-2">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Brain className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                DASS-21 Assessment
              </CardTitle>
              <CardDescription className="text-lg">
                Depression, Anxiety, and Stress Scale
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3 text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium">
                      Welcome{user?.name || user?.username ? `, ${user?.name || user?.username}` : ''}! This assessment helps us understand your current emotional state.
                    </p>
                    <p>
                      Please read each statement and select how much it applied to you <strong>over the past week</strong>.
                    </p>
                    <p>
                      There are no right or wrong answers. Don't spend too much time on any statement.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sections.map((section) => (
                  <div
                    key={section.name}
                    className={cn(
                      'p-4 rounded-xl border-2 text-center',
                      section.bgColor,
                      section.borderColor
                    )}
                  >
                    <section.icon className="w-8 h-8 mx-auto mb-2 opacity-70" />
                    <div className="font-semibold">{section.name}</div>
                    <div className="text-xs opacity-70">{section.questions.length} questions</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  This assessment takes approximately 5-10 minutes to complete.
                </p>
              </div>

              {/* Show previous results info and skip option */}
              {!isLoadingPrevious && previousResults && (
                <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        You've already completed an assessment
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Last taken: {new Date(previousResults.completedAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        You can retake it to update your results, or skip to continue with your previous assessment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => setShowInstructions(false)}
                  className="w-full h-12 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg shadow-blue-500/25"
                >
                  {previousResults ? 'Retake Assessment' : 'Begin Assessment'}
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>

                {!isLoadingPrevious && previousResults && (
                  <Button
                    onClick={handleSkipToChat}
                    variant="outline"
                    className="w-full h-12 text-lg border-2"
                  >
                    Skip & Go to Chat
                    <Sparkles className="ml-2 w-5 h-5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // =============================================================================
  // RENDER: Results
  // =============================================================================

  if (showResults && results) {
    const getRecommendations = () => {
      const recommendations = [];
      
      if (results.severityLevels.depression.level !== 'Normal') {
        recommendations.push({
          icon: '💙',
          title: 'Depression Support',
          text: 'Consider regular journaling to track your mood patterns. Engage in activities you used to enjoy.',
        });
      }
      
      if (results.severityLevels.anxiety.level !== 'Normal') {
        recommendations.push({
          icon: '🫁',
          title: 'Anxiety Management',
          text: 'Practice deep breathing exercises and mindfulness. Try to identify and challenge anxious thoughts.',
        });
      }
      
      if (results.severityLevels.stress.level !== 'Normal') {
        recommendations.push({
          icon: '🧘',
          title: 'Stress Reduction',
          text: 'Prioritize self-care and set healthy boundaries. Regular physical activity can significantly reduce stress.',
        });
      }

      if (recommendations.length === 0) {
        recommendations.push({
          icon: '✨',
          title: 'Maintain Well-being',
          text: 'Continue your current self-care practices. Regular check-ins through journaling can help maintain your mental health.',
        });
      }

      return recommendations;
    };

    return (
      <div className="min-h-screen p-4 py-8 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              Assessment Complete
            </h1>
            <p className="text-muted-foreground mt-2">
              Here are your DASS-21 results
            </p>
          </motion.div>

          {/* Scores */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Your Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Depression */}
                  <div className={cn('p-6 rounded-xl border-2', results.severityLevels.depression.bgClass, 'border-current')}>
                    <div className="text-center">
                      <Heart className="w-10 h-10 mx-auto mb-3 text-blue-500" />
                      <h3 className="font-bold text-lg mb-2">Depression</h3>
                      <div className="text-4xl font-bold mb-1">{results.scores.depression}</div>
                      <div className="text-xs opacity-70 mb-3">out of 42</div>
                      <Badge className={cn(results.severityLevels.depression.bgClass, results.severityLevels.depression.textClass, 'border-0')}>
                        {results.severityLevels.depression.level}
                      </Badge>
                    </div>
                  </div>

                  {/* Anxiety */}
                  <div className={cn('p-6 rounded-xl border-2', results.severityLevels.anxiety.bgClass, 'border-current')}>
                    <div className="text-center">
                      <Zap className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                      <h3 className="font-bold text-lg mb-2">Anxiety</h3>
                      <div className="text-4xl font-bold mb-1">{results.scores.anxiety}</div>
                      <div className="text-xs opacity-70 mb-3">out of 42</div>
                      <Badge className={cn(results.severityLevels.anxiety.bgClass, results.severityLevels.anxiety.textClass, 'border-0')}>
                        {results.severityLevels.anxiety.level}
                      </Badge>
                    </div>
                  </div>

                  {/* Stress */}
                  <div className={cn('p-6 rounded-xl border-2', results.severityLevels.stress.bgClass, 'border-current')}>
                    <div className="text-center">
                      <Flame className="w-10 h-10 mx-auto mb-3 text-rose-500" />
                      <h3 className="font-bold text-lg mb-2">Stress</h3>
                      <div className="text-4xl font-bold mb-1">{results.scores.stress}</div>
                      <div className="text-xs opacity-70 mb-3">out of 42</div>
                      <Badge className={cn(results.severityLevels.stress.bgClass, results.severityLevels.stress.textClass, 'border-0')}>
                        {results.severityLevels.stress.level}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Recommendations */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Personalized Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getRecommendations().map((rec, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                      <div className="text-2xl">{rec.icon}</div>
                      <div>
                        <h4 className="font-semibold">{rec.title}</h4>
                        <p className="text-sm text-muted-foreground">{rec.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Continue Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <Button
              onClick={handleContinueToApp}
              className="h-12 px-8 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg shadow-blue-500/25"
            >
              Continue to MindScribe
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
            <p className="text-sm text-muted-foreground mt-3">
              Your results have been saved and will personalize your experience
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // =============================================================================
  // RENDER: Questions
  // =============================================================================

  const section = sections[currentSection];

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-3xl mx-auto">
        {/* Progress Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Section {currentSection + 1} of {sections.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {answeredQuestions} of {totalQuestions} questions answered
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Section Header */}
        <motion.div
          key={currentSection}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Card className={cn('border-2', section.bgColor, section.borderColor)}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={cn(
                  'w-14 h-14 rounded-xl flex items-center justify-center',
                  section.color === 'blue' && 'bg-blue-500',
                  section.color === 'amber' && 'bg-amber-500',
                  section.color === 'rose' && 'bg-rose-500'
                )}>
                  <section.icon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{section.name}</h2>
                  <p className="text-muted-foreground">{section.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Questions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {section.questions.map((question, qIndex) => (
              <Card
                key={question.id}
                className={cn(
                  'border-2 transition-all',
                  responses[question.id] !== undefined
                    ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                )}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3 mb-4">
                    <span className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                      responses[question.id] !== undefined
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    )}>
                      {qIndex + 1}
                    </span>
                    <p className="text-sm md:text-base pt-1">{question.text}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {scaleOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleResponse(question.id, option.value)}
                        className={cn(
                          'p-3 rounded-xl text-sm font-medium transition-all border-2',
                          responses[question.id] === option.value
                            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-transparent shadow-lg'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                        )}
                      >
                        <div className="text-lg font-bold mb-1">{option.value}</div>
                        <div className="text-xs opacity-80">{option.short}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pb-8">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentSection === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {sections.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'w-3 h-3 rounded-full transition-all',
                  index === currentSection
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 scale-125'
                    : index < currentSection
                    ? 'bg-green-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                )}
              />
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={!isCurrentSectionComplete()}
            className="gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            {currentSection === sections.length - 1 ? 'Complete' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentPage;
