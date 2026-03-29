export interface GuidedTourStep {
  id: string;
  title: string;
  description: string;
  route: string;
  targetSelector?: string;
}

export const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to MindScribe',
    description:
      'This quick guide will show you every core space and how to get your local AI ready on this device.',
    route: '/',
    targetSelector: '[data-tour-id="nav-chat"]',
  },
  {
    id: 'journal',
    title: 'Journal Space',
    description:
      'Use Journal for private daily reflection. Entries stay local and help your companion keep context.',
    route: '/',
    targetSelector: '[data-tour-id="nav-journal"]',
  },
  {
    id: 'voice',
    title: 'Voice Support',
    description:
      'Voice lets you talk naturally when typing feels heavy. You can switch between listening and speaking modes anytime.',
    route: '/',
    targetSelector: '[data-tour-id="nav-voice"]',
  },
  {
    id: 'dashboard',
    title: 'Progress Dashboard',
    description:
      'Dashboard gives trend views for your mood and patterns so you can track change over time.',
    route: '/',
    targetSelector: '[data-tour-id="nav-dashboard"]',
  },
  {
    id: 'reports',
    title: 'Reports and Exports',
    description:
      'Reports lets you export insights when you want a summary for yourself or to share with a professional.',
    route: '/',
    targetSelector: '[data-tour-id="nav-reports"]',
  },
  {
    id: 'checkin',
    title: 'Mental Health Check-in',
    description:
      'Check-in is a guided assessment that helps personalize support. You can do it now or later.',
    route: '/',
    targetSelector: '[data-tour-id="nav-assessment"]',
  },
  {
    id: 'settings',
    title: 'Open Settings',
    description:
      'Settings is where you manage your local model setup and performance preferences.',
    route: '/',
    targetSelector: '[data-tour-id="nav-settings"]',
  },
  {
    id: 'model-overview',
    title: 'Local Model Setup',
    description:
      'Use Download Model or Change Model here to open the side panel and pick your model. Keep this tab open during download and ensure stable internet. Most models need about 1 to 5 GB of free storage.',
    route: '/settings',
    targetSelector: '[data-tour-id="settings-local-model"]',
  },
  {
    id: 'model-activate',
    title: 'Load and Activate',
    description:
      'After download, choose a model as active. Once active, chat and voice will use it for local responses.',
    route: '/settings',
    targetSelector: '[data-tour-id="settings-model-status"]',
  },
  {
    id: 'voice-readiness',
    title: 'Voice Readiness',
    description:
      'On Voice, the badges show what is ready. If a model is not loaded yet, use Settings first, then come back here.',
    route: '/voice',
    targetSelector: '[data-tour-id="voice-readiness"]',
  },
  {
    id: 'done',
    title: 'You are Ready',
    description:
      'You can now use Companion, Journal, Voice, Dashboard, Reports, and Check-in confidently. You can restart this tour anytime from Settings.',
    route: '/',
  },
];
