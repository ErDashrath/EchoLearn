import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { GUIDED_TOUR_STEPS, type GuidedTourStep } from '@/lib/tour-steps';

interface PersistedTourState {
  completed: boolean;
  autoShown: boolean;
  lastStepIndex: number;
}

interface TourContextType {
  isActive: boolean;
  currentStep: GuidedTourStep;
  currentStepIndex: number;
  totalSteps: number;
  canGoBack: boolean;
  isLastStep: boolean;
  startTour: (fromBeginning?: boolean) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

const DEFAULT_STATE: PersistedTourState = {
  completed: false,
  autoShown: false,
  lastStepIndex: 0,
};

const clampStep = (index: number): number => {
  if (index < 0) return 0;
  if (index >= GUIDED_TOUR_STEPS.length) return GUIDED_TOUR_STEPS.length - 1;
  return index;
};

const parsePersistedState = (raw: string | null): PersistedTourState => {
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTourState>;
    return {
      completed: !!parsed.completed,
      autoShown: !!parsed.autoShown,
      lastStepIndex: clampStep(typeof parsed.lastStepIndex === 'number' ? parsed.lastStepIndex : 0),
    };
  } catch {
    return DEFAULT_STATE;
  }
};

const getVisibleTarget = (selector?: string): HTMLElement | null => {
  if (!selector || typeof window === 'undefined') return null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null
  );
};

const GuidedTourOverlay: React.FC<{
  isOpen: boolean;
  step: GuidedTourStep;
  stepIndex: number;
  totalSteps: number;
  canGoBack: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}> = ({
  isOpen,
  step,
  stepIndex,
  totalSteps,
  canGoBack,
  isLastStep,
  onBack,
  onNext,
  onSkip,
}) => {
  const [targetPresent, setTargetPresent] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTargetPresent(false);
      return;
    }

    let highlightedElement: HTMLElement | null = null;

    const updateTargetRect = () => {
      const target = getVisibleTarget(step.targetSelector);
      if (highlightedElement && highlightedElement !== target) {
        highlightedElement.classList.remove('tour-highlight-target');
        highlightedElement = null;
      }

      if (target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        target.classList.add('tour-highlight-target');
        highlightedElement = target;
        setTargetPresent(true);
        return;
      }

      setTargetPresent(false);
    };

    updateTargetRect();
    const timeoutId = window.setTimeout(updateTargetRect, 180);
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      if (highlightedElement) {
        highlightedElement.classList.remove('tour-highlight-target');
      }
    };
  }, [isOpen, step.targetSelector, step.route, stepIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[0.5px] pointer-events-none" />

      <div className="absolute bottom-4 left-1/2 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-[rgba(245,158,11,0.3)] bg-white/95 p-5 shadow-2xl md:bottom-6 pointer-events-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Step {stepIndex + 1} of {totalSteps}
        </p>
        <h3 className="mt-1 text-xl font-semibold text-slate-900">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{step.description}</p>
        {!targetPresent && (
          <p className="mt-2 text-xs text-slate-500">
            Tip: this step is informational. Continue when you are ready.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onSkip} className="text-slate-600 hover:text-slate-900">
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={!canGoBack} onClick={onBack}>
              Back
            </Button>
            <Button onClick={onNext} className="bg-[var(--accent)] text-black hover:bg-[var(--accent-dark)]">
              {isLastStep ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useLocation();
  const { user, isLoading, hasCompletedDASS21 } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [persistedState, setPersistedState] = useState<PersistedTourState>(DEFAULT_STATE);

  const storageKey = user?.username ? `mindscribe.tour.v1.${user.username}` : null;

  const saveState = (next: PersistedTourState) => {
    setPersistedState(next);
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  };

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setPersistedState(DEFAULT_STATE);
      setIsActive(false);
      setCurrentStepIndex(0);
      return;
    }

    const parsed = parsePersistedState(window.localStorage.getItem(storageKey));
    setPersistedState(parsed);
    setCurrentStepIndex(parsed.lastStepIndex);
    setIsActive(false);
  }, [storageKey]);

  useEffect(() => {
    if (isLoading || !user || !storageKey) return;
    if (!hasCompletedDASS21) return;
    if (persistedState.completed || persistedState.autoShown) return;

    const timeoutId = window.setTimeout(() => {
      setCurrentStepIndex(0);
      setIsActive(true);
      saveState({ ...persistedState, autoShown: true, lastStepIndex: 0 });
    }, 550);

    return () => window.clearTimeout(timeoutId);
  }, [isLoading, user, storageKey, persistedState, hasCompletedDASS21]);

  const currentStep = GUIDED_TOUR_STEPS[clampStep(currentStepIndex)];

  useEffect(() => {
    if (!isActive || !currentStep) return;
    if (location !== currentStep.route) {
      setLocation(currentStep.route);
    }
  }, [isActive, currentStep, location, setLocation]);

  const startTour = (fromBeginning = false) => {
    const nextIndex = fromBeginning ? 0 : persistedState.lastStepIndex;
    setCurrentStepIndex(clampStep(nextIndex));
    setIsActive(true);
    if (!persistedState.autoShown) {
      saveState({ ...persistedState, autoShown: true, lastStepIndex: clampStep(nextIndex) });
    }
  };

  const previousStep = () => {
    setCurrentStepIndex((prev) => {
      const next = clampStep(prev - 1);
      saveState({ ...persistedState, lastStepIndex: next });
      return next;
    });
  };

  const completeTour = () => {
    setIsActive(false);
    saveState({ completed: true, autoShown: true, lastStepIndex: 0 });
  };

  const nextStep = () => {
    if (currentStepIndex >= GUIDED_TOUR_STEPS.length - 1) {
      completeTour();
      return;
    }

    setCurrentStepIndex((prev) => {
      const next = clampStep(prev + 1);
      saveState({ ...persistedState, lastStepIndex: next });
      return next;
    });
  };

  const skipTour = () => {
    setIsActive(false);
    saveState({ ...persistedState, autoShown: true, lastStepIndex: clampStep(currentStepIndex) });
  };

  const contextValue = useMemo<TourContextType>(() => ({
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps: GUIDED_TOUR_STEPS.length,
    canGoBack: currentStepIndex > 0,
    isLastStep: currentStepIndex === GUIDED_TOUR_STEPS.length - 1,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    completeTour,
  }), [isActive, currentStep, currentStepIndex]);

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      <GuidedTourOverlay
        isOpen={isActive}
        step={currentStep}
        stepIndex={currentStepIndex}
        totalSteps={GUIDED_TOUR_STEPS.length}
        canGoBack={currentStepIndex > 0}
        isLastStep={currentStepIndex === GUIDED_TOUR_STEPS.length - 1}
        onBack={previousStep}
        onNext={nextStep}
        onSkip={skipTour}
      />
    </TourContext.Provider>
  );
};

export const useTour = (): TourContextType => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within TourProvider');
  }
  return context;
};
