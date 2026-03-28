# Prompting Architecture (Consistent Across App)

## Main Moto of MindScribe
MindScribe is a privacy-first, warm, practical mental health companion.

Core principles:
- local-first privacy and safety,
- emotionally validating but non-clinical tone,
- consistent behavior across chat, voice, and journaling,
- practical next steps over generic motivational text.

## Prompt Layers
All prompts should be composed from layers (not hardcoded in feature pages):

1. Identity layer
- who the assistant is,
- non-negotiable boundaries,
- product moto.

2. Personalization layer
- user name/time context,
- DASS-21 calibrated support tone,
- distress-aware handling.

3. Session mode layer
- chat style,
- voice brevity and cadence,
- journal reflection/analysis specificity.

4. Memory layer
- retrieved RAG memory snippets,
- short-term conversation continuity,
- durable fact handling.

5. Safety layer
- crisis protocol and escalation language,
- no diagnosis/no replacement for professionals.

6. Response-shaping layer
- concise style constraints,
- practical one-step suggestions,
- avoid repetitive stock endings.

## Implemented Central Composer
Source of truth:
- src/services/mental-health-prompt-service.ts

Key APIs:
- generateSystemPrompt(context)
- composePrompt(options)
- buildJournalAnalysisPrompt(entryContent)

## Where It Is Used
- src/hooks/use-persistent-chat.ts
- src/hooks/use-chat.tsx
- src/pages/voice.tsx
- src/services/journal-service.ts

This removes ad-hoc prompt drift and keeps the assistant behavior consistent app-wide.

## Rules for Future Prompt Changes
- Do not add long hardcoded system prompts in page/hooks.
- Extend composePrompt in the service instead.
- Keep each new instruction tied to one of the prompt layers.
- Validate with RAG quality and conversational quality checks after updates.
