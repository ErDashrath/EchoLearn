# 🚀 MindScribe V2.0 - Migration & Enhancement Plan

## Project: EchoLearn → MindScribe V2.0

A comprehensive plan to migrate MindScribe V0.1 features to EchoLearn with enterprise-grade UI using skills.sh ecosystem.

---

## 📦 Skills.sh Integration

### Install Required Skills
```bash
# Core UI & Best Practices
npx skills add vercel-labs/agent-skills/vercel-react-best-practices
npx skills add vercel-labs/agent-skills/web-design-guidelines
npx skills add anthropics/skills/frontend-design

# Animation & Motion
npx skills add remotion-dev/skills/remotion-best-practices

# Additional (search on skills.sh)
npx skills add vercel-labs/agent-browser
```

---

## 🎯 Feature Migration Plan (Numbered Modules)

### Phase 1: Core Infrastructure (Week 1)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F001** | Auth System | Local authentication with encrypted storage | 🔴 High | ✅ Complete |
| **F002** | Encrypted Storage | LocalForage + Web Crypto API | 🔴 High | ✅ Complete |
| **F003** | Theme System | Dark/Light mode with system preference | 🟡 Medium | ✅ Complete |
| **F004** | Layout System | Responsive sidebar + header + main content | 🔴 High | ✅ Complete |

### Phase 2: Mental Health Core (Week 2)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F005** | DASS-21 Assessment | Depression, Anxiety, Stress screening | 🔴 High | ✅ Complete |
| **F006** | Assessment Results | Visual score display with severity levels | 🔴 High | ✅ Complete |
| **F007** | User Onboarding | First-time user flow with assessment | 🟡 Medium | ✅ Complete |

### Phase 3: AI Chat (Week 2-3)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F008** | WebLLM Chat | Optimized AI chat (already fast) | 🔴 High | ✅ Complete |
| **F009** | DASS-21 Context | Inject assessment into AI prompts | 🟡 Medium | ✅ Complete |
| **F010** | Chat History | Persist conversations with encryption | 🟡 Medium | ✅ Complete |
| **F011** | Typing Indicators | Animated AI thinking state | 🟢 Low | ✅ Complete |

### Phase 4: Voice Therapy (Week 3-4)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F012** | Whisper STT | Speech-to-text using @huggingface/transformers | 🔴 High | ✅ Complete |
| **F013** | Piper TTS | Text-to-speech using piper-wasm | 🔴 High | ✅ Complete |
| **F014** | Voice Visualizer | Audio waveform animation | 🟡 Medium | ✅ Complete |
| **F015** | Voice Selector | Choose TTS voice (5 ASMR voices) | 🟡 Medium | ✅ Complete |
| **F016** | Voice Session | Push-to-talk conversation flow | 🔴 High | ✅ Complete |

### Phase 5: Journaling (Week 4)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F017** | Journal Editor | Rich text entry with auto-save | 🔴 High | ✅ Complete |
| **F018** | AI Analysis | Mood, sentiment, stress detection | 🔴 High | ✅ Complete |
| **F019** | Journal History | List with search and filters | 🟡 Medium | ✅ Complete |
| **F020** | Entry Details | View analysis results per entry | 🟡 Medium | ✅ Complete |

### Phase 6: Dashboard & Analytics (Week 5)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F021** | Stats Overview | Total entries, avg mood, trends | 🔴 High | ✅ Complete |
| **F022** | Mood Charts | Area chart for sentiment over time | 🔴 High | ✅ Complete |
| **F023** | Emotion Distribution | Pie chart for emotions | 🟡 Medium | ✅ Complete |
| **F024** | Stress Levels | Bar chart stress distribution | 🟡 Medium | ✅ Complete |
| **F025** | DASS-21 Progress | Assessment baseline display | 🟡 Medium | ✅ Complete |

### Phase 7: Reports & Export (Week 5)

| # | Module | Description | Priority | Status |
|---|--------|-------------|----------|--------|
| **F026** | PDF Report | Generate mental health summary PDF | 🟡 Medium | ✅ Complete |
| **F027** | Data Export | Export journal data as JSON/CSV | 🟢 Low | ✅ Complete |

---

## 🎨 UI Enhancement Plan (Enterprise Grade)

### U001: Design System Overhaul

**Current State:** Basic shadcn/ui components
**Target State:** Polished enterprise-grade design

#### Color Palette
```css
/* Primary - Calming Blue */
--primary: 221 83% 53%;        /* #3B82F6 */
--primary-foreground: 0 0% 100%;

/* Accent - Soothing Purple */
--accent: 262 83% 58%;          /* #8B5CF6 */

/* Semantic Colors */
--success: 142 76% 36%;         /* Green - Positive */
--warning: 38 92% 50%;          /* Amber - Caution */
--destructive: 0 84% 60%;       /* Red - Alert */

/* Mental Health Severity */
--severity-normal: 142 76% 36%;
--severity-mild: 199 89% 48%;
--severity-moderate: 38 92% 50%;
--severity-severe: 25 95% 53%;
--severity-extreme: 0 84% 60%;
```

### U002: Typography System

```css
/* Font Stack */
--font-sans: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */
```

### U003: Component Upgrades

| Component | Enhancement |
|-----------|-------------|
| **Buttons** | Gradient backgrounds, micro-interactions, loading states |
| **Cards** | Glassmorphism, subtle shadows, hover elevations |
| **Inputs** | Floating labels, validation states, focus rings |
| **Modals** | Backdrop blur, slide-in animations, nested dialogs |
| **Navigation** | Collapsible sidebar, breadcrumbs, active indicators |
| **Charts** | Animated transitions, tooltips, responsive legends |

### U004: Animation System (Framer Motion)

```tsx
// Page Transitions
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

// Stagger Children
const containerVariants = {
  animate: { transition: { staggerChildren: 0.1 } }
};

// Micro-interactions
const buttonTap = { scale: 0.98 };
const cardHover = { y: -4, shadow: "0 20px 40px rgba(0,0,0,0.1)" };
```

### U005: Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Search | Theme Toggle | User Menu        │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │  Main Content Area                           │
│          │                                              │
│ • Chat   │  ┌─────────────────────────────────────────┐ │
│ • Voice  │  │                                         │ │
│ • Journal│  │  Page Content                           │ │
│ • Dash   │  │                                         │ │
│ • Report │  │                                         │ │
│          │  └─────────────────────────────────────────┘ │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│ Footer (optional): Version | Privacy | Help             │
└─────────────────────────────────────────────────────────┘
```

### U006: Responsive Breakpoints

```css
/* Mobile First */
--screen-sm: 640px;   /* Small tablets */
--screen-md: 768px;   /* Tablets */
--screen-lg: 1024px;  /* Small laptops */
--screen-xl: 1280px;  /* Desktops */
--screen-2xl: 1536px; /* Large screens */
```

---

## 🏗️ Implementation Order

### Sprint 1: Foundation (F001-F004, U001-U006)
1. ⬜ Install skills.sh packages
2. ⬜ Set up design tokens (colors, typography)
3. ⬜ Create layout components (Sidebar, Header)
4. ⬜ Implement auth system with encryption
5. ⬜ Add page transitions

### Sprint 2: Assessment (F005-F007)
1. ⬜ Build DASS-21 questionnaire UI
2. ⬜ Create results visualization
3. ⬜ Implement onboarding flow

### Sprint 3: Chat Enhancement (F009-F011)
1. ⬜ Integrate DASS-21 context into prompts
2. ⬜ Add chat persistence
3. ⬜ Polish chat UI with animations

### Sprint 4: Voice (F012-F016)
1. ⬜ Integrate Whisper for STT
2. ⬜ Integrate Piper for TTS
3. ⬜ Build voice therapy UI
4. ⬜ Add voice visualizer

### Sprint 5: Journal & Dashboard (F017-F025)
1. ⬜ Build journal editor
2. ⬜ Implement AI analysis
3. ⬜ Create dashboard with charts
4. ⬜ Add analytics visualizations

### Sprint 6: Polish & Export (F026-F027)
1. ⬜ PDF report generation
2. ⬜ Data export functionality
3. ⬜ Final UI polish
4. ⬜ Performance optimization

---

## 📁 Target File Structure

```
src/
├── components/
│   ├── ui/                    # shadcn components (enhanced)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── MainLayout.tsx
│   │   └── PageTransition.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── ProtectedRoute.tsx
│   ├── assessment/
│   │   ├── DASS21.tsx
│   │   ├── DASS21Results.tsx
│   │   └── QuestionCard.tsx
│   ├── chat/
│   │   ├── ChatArea.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── InputArea.tsx
│   │   └── TypingIndicator.tsx
│   ├── voice/
│   │   ├── VoiceTherapy.tsx
│   │   ├── VoiceVisualizer.tsx
│   │   ├── VoiceSelector.tsx
│   │   └── SessionControls.tsx
│   ├── journal/
│   │   ├── JournalEditor.tsx
│   │   ├── JournalList.tsx
│   │   ├── EntryCard.tsx
│   │   └── AnalysisDisplay.tsx
│   └── dashboard/
│       ├── StatsOverview.tsx
│       ├── MoodChart.tsx
│       ├── EmotionPie.tsx
│       └── DASSProgress.tsx
├── pages/
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Assessment.tsx
│   ├── Chat.tsx
│   ├── Voice.tsx
│   ├── Journal.tsx
│   ├── Dashboard.tsx
│   └── Report.tsx
├── services/
│   ├── webllm-service.ts      # Optimized (existing)
│   ├── whisper-service.ts     # NEW
│   ├── piper-service.ts       # NEW
│   ├── storage-service.ts     # NEW (encrypted)
│   └── auth-service.ts        # NEW
├── contexts/
│   ├── AuthContext.tsx
│   ├── WebLLMContext.tsx
│   └── VoiceContext.tsx
├── hooks/
│   ├── use-auth.ts
│   ├── use-chat.ts
│   ├── use-voice.ts
│   └── use-journal.ts
├── lib/
│   ├── utils.ts
│   ├── crypto.ts              # Encryption utilities
│   └── constants.ts
└── styles/
    ├── globals.css
    └── animations.css
```

---

## 🚦 Current Status

| Phase | Progress | Notes |
|-------|----------|-------|
| Phase 1 | 25% | Theme exists, need auth & layout |
| Phase 2 | 0% | Not started |
| Phase 3 | 60% | WebLLM works, need persistence |
| Phase 4 | 0% | Not started |
| Phase 5 | 0% | Not started |
| Phase 6 | 0% | Not started |
| Phase 7 | 0% | Not started |

---

## 🎯 Next Actions

1. **Install skills.sh packages**
2. **Create MainLayout component (F004)**
3. **Set up design tokens (U001)**
4. **Build auth system (F001, F002)**

---

*Plan Version: 1.0*
*Created: January 31, 2026*
*Project: MindScribe V2.0 (EchoLearn)*
