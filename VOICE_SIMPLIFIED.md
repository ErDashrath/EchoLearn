# Voice Therapy - Optimized Offline Flow

## Goal
- Smooth, soothing voice output with the lowest practical lag.
- Natural turn-taking without extra clicks.

## Current Architecture

### TTS (Primary)
- **Web Speech API TTS** (browser-native voices).
- No model download needed.
- Fast startup and low response latency.
- Long responses are split into sentence-aware chunks for smoother rhythm.

### TTS (Fallback)
- None. Web Speech API is the active TTS path.

### STT
- **Browser SpeechRecognition / webkitSpeechRecognition**.
- Works as fast lightweight STT for conversational flow.

## Conversation UX
- **Push-to-talk mode**: press and hold to speak.
- **Continuous mode**:
  - one tap to start listening,
  - auto-send when user is silent for **1.5 seconds**,
  - AI speaks,
  - listening restarts automatically.

## Startup Optimization
- On login/session restore, native voices preload in background.

## Key Files
- `src/services/voice-service-web.ts`
  - Native Web Speech TTS management
  - STT wiring
- `src/hooks/use-voice.ts`
  - Hook binding to optimized voice service
- `src/pages/voice.tsx`
  - Continuous conversation logic
  - 1.5s silence auto-submit behavior

## Notes
- Voice quality depends on OS/browser available voices.
- Response length is intentionally short to keep TTS turnaround fast.
