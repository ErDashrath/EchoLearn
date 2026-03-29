import {
  mentalHealthPromptService,
  type DASS21Results,
  type PromptContext,
} from '@/services/mental-health-prompt-service';

export type PromptProvider = 'webllm-webgpu' | 'native-cpu';

export interface PromptTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ComposeTurnPromptOptions {
  provider: PromptProvider;
  modelId?: string | null;
  context: {
    userName?: string;
    dass21Results?: DASS21Results | null;
    sessionType: PromptContext['sessionType'];
    timeOfDay?: PromptContext['timeOfDay'];
  };
  userMessage: string;
  retrievedMemoryPrompt?: string;
  extraContextSections?: string[];
  addConversationalContinuity?: boolean;
  forceCasualCompanionMode?: boolean;
  includeCrisisAugment?: boolean;
  recentConversation?: PromptTurnMessage[];
  budget?: PromptBudgetOptions;
}

export interface ComposeTurnPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

interface HistoryTrimOptions {
  maxTurns?: number;
  maxCharsPerMessage?: number;
  maxTokensPerMessage?: number;
}

export interface PromptBudgetOptions {
  modelContextTokens?: number;
  reservedResponseTokens?: number;
  maxInputTokens?: number;
  maxSystemPromptTokens?: number;
  maxUserPromptTokens?: number;
  maxRetrievedPromptTokens?: number;
  maxSectionTokens?: number;
}

export interface ContextBudgetRecommendation {
  modelContextTokens: number;
  reservedResponseTokens: number;
  maxInputTokens: number;
}

interface ResolvedPromptBudget {
  maxSystemPromptTokens: number;
  maxUserPromptTokens: number;
  maxRetrievedPromptTokens: number;
  maxSectionTokens: number;
}

const DEFAULT_HISTORY_TURNS = 8;
const DEFAULT_HISTORY_MESSAGE_CHARS = 720;
const DEFAULT_MODEL_CONTEXT_TOKENS = 8192;
const DEFAULT_RESERVED_RESPONSE_TOKENS = 1024;
const WEB_SYSTEM_PROMPT_MAX = 24000;
const NATIVE_SYSTEM_PROMPT_MAX = 18000;
const WEB_USER_PROMPT_MAX = 6000;
const NATIVE_USER_PROMPT_MAX = 4500;
const RETRIEVAL_PROMPT_MAX = 16000;
const EXTRA_SECTION_MAX = 4000;
const NATIVE_RECENT_TURNS_MAX = 6;
const NATIVE_RECENT_TURN_CHARS = 480;
const NATIVE_RECENT_TURN_MAX_TOKENS = 160;

const CJK_REGEX = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const PUNCTUATION_REGEX = /[.,!?;:()\[\]{}"'`]/g;

const NATIVE_IDENTITY_GUARD = [
  'You are MindScribe, a warm friend-like mental health companion.',
  'Never claim to be Qwen, Alibaba Cloud, or any model/vendor name.',
  'Do not echo or quote the user message.',
  'Return only the assistant reply text with no role prefixes.',
].join(' ');

const UNIVERSAL_SYSTEM_IDENTITY_POLICY = [
  'Identity policy: You are MindScribe.',
  'Never identify as Qwen, Alibaba Cloud, or any model/vendor.',
  'Do not repeat the user text in your reply.',
].join(' ');

const INTERNAL_REASONING_CHAIN_POLICY = [
  'Internal reasoning protocol (never reveal these steps):',
  '1) Identify the user\'s emotional state and immediate intent.',
  '2) Check whether crisis-risk language is present and prioritize safety if needed.',
  '3) Ground response in retrieved memory/context only when relevant; never fabricate.',
  '4) Build the reply in order: empathy, short validation, one practical next step, optional gentle question.',
  '5) Keep tone warm and human; avoid generic virtual-assistant self-description.',
  'Output rule: return only the final user-facing reply, never internal reasoning.',
].join(' ');

const MODEL_3B_OR_HIGHER_REGEX = /(\b3b\b|\b4b\b|\b7b\b|\b8b\b|\b9b\b|\b13b\b|\b14b\b|\b32b\b|\b70b\b)/i;
const MODEL_15B_OR_2B_REGEX = /(\b1[._-]?5b\b|\b2b\b)/i;

export const getRecommendedContextBudget = (
  modelId?: string | null,
  provider?: PromptProvider | null,
): ContextBudgetRecommendation => {
  const normalized = (modelId || '').toLowerCase();
  const native = provider === 'native-cpu';

  if (MODEL_3B_OR_HIGHER_REGEX.test(normalized)) {
    const modelContextTokens = native ? 12288 : 16384;
    const reservedResponseTokens = native ? 1280 : 1536;
    return {
      modelContextTokens,
      reservedResponseTokens,
      maxInputTokens: modelContextTokens - reservedResponseTokens,
    };
  }

  if (MODEL_15B_OR_2B_REGEX.test(normalized)) {
    const modelContextTokens = native ? 10240 : 12288;
    const reservedResponseTokens = native ? 1152 : 1280;
    return {
      modelContextTokens,
      reservedResponseTokens,
      maxInputTokens: modelContextTokens - reservedResponseTokens,
    };
  }

  return {
    modelContextTokens: DEFAULT_MODEL_CONTEXT_TOKENS,
    reservedResponseTokens: DEFAULT_RESERVED_RESPONSE_TOKENS,
    maxInputTokens: DEFAULT_MODEL_CONTEXT_TOKENS - DEFAULT_RESERVED_RESPONSE_TOKENS,
  };
};

const trimToMaxChars = (value: string, maxChars: number): string => {
  const text = value.trim();
  if (!text) {
    return text;
  }

  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return text;
  }

  return chars.slice(0, maxChars).join('');
};

const estimateTokenCount = (value: string): number => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 0;
  }

  const words = normalized.split(' ');
  let tokens = 0;

  for (const word of words) {
    const chars = Array.from(word);
    let bufferedAscii = '';
    let wordTokens = 0;

    for (const char of chars) {
      if (CJK_REGEX.test(char)) {
        if (bufferedAscii) {
          wordTokens += Math.max(1, Math.ceil(Array.from(bufferedAscii).length / 4));
          bufferedAscii = '';
        }
        wordTokens += 1;
      } else {
        bufferedAscii += char;
      }
    }

    if (bufferedAscii) {
      wordTokens += Math.max(1, Math.ceil(Array.from(bufferedAscii).length / 4));
    }

    tokens += Math.max(1, wordTokens);
  }

  const punctuationCount = normalized.match(PUNCTUATION_REGEX)?.length ?? 0;
  tokens += Math.ceil(punctuationCount * 0.2);
  tokens += Math.ceil(words.length * 0.08);

  return Math.max(1, tokens);
};

const clampTextByTokenBudget = (
  value: string,
  maxTokens: number,
  maxChars: number,
): string => {
  const charBounded = trimToMaxChars(value, maxChars);
  if (!charBounded) {
    return '';
  }

  if (estimateTokenCount(charBounded) <= maxTokens) {
    return charBounded;
  }

  const chars = Array.from(charBounded);
  let low = 0;
  let high = chars.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = chars.slice(0, mid).join('').trimEnd();

    if (!candidate) {
      low = mid + 1;
      continue;
    }

    if (estimateTokenCount(candidate) <= maxTokens) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!best) {
    const fallbackLength = Math.max(1, Math.min(chars.length, Math.floor(maxTokens * 3)));
    best = chars.slice(0, fallbackLength).join('').trimEnd();
  }

  if (best.length < charBounded.length) {
    let candidate = `${best.trimEnd()}...`;
    while (candidate && estimateTokenCount(candidate) > maxTokens) {
      const clipped = Array.from(best);
      if (!clipped.length) {
        break;
      }
      clipped.pop();
      best = clipped.join('').trimEnd();
      candidate = best ? `${best}...` : '';
    }

    return candidate || best;
  }

  return best;
};

const resolvePromptBudget = (
  provider: PromptProvider,
  budget?: PromptBudgetOptions,
): ResolvedPromptBudget => {
  const modelContextTokens = budget?.modelContextTokens ?? DEFAULT_MODEL_CONTEXT_TOKENS;
  const reservedResponseTokens = budget?.reservedResponseTokens ?? DEFAULT_RESERVED_RESPONSE_TOKENS;
  const availableInputTokens = Math.max(768, modelContextTokens - reservedResponseTokens);
  const cappedInputTokens = typeof budget?.maxInputTokens === 'number'
    ? Math.max(384, Math.min(availableInputTokens, budget.maxInputTokens))
    : availableInputTokens;

  const native = provider === 'native-cpu';
  const defaultSystemCap = native ? 4200 : 4800;
  const defaultSystemRatio = native ? 0.8 : 0.82;
  const defaultUserCap = native ? 1024 : 1200;

  const maxSystemPromptTokens = Math.max(
    260,
    budget?.maxSystemPromptTokens ?? Math.min(defaultSystemCap, Math.floor(cappedInputTokens * defaultSystemRatio)),
  );

  const maxUserPromptTokens = Math.max(
    80,
    budget?.maxUserPromptTokens ?? Math.min(defaultUserCap, Math.floor(cappedInputTokens * 0.35)),
  );

  const maxRetrievedPromptTokens = Math.max(
    100,
    budget?.maxRetrievedPromptTokens ?? Math.min(1800, Math.floor(maxSystemPromptTokens * 0.45)),
  );

  const maxSectionTokens = Math.max(
    60,
    budget?.maxSectionTokens ?? Math.min(600, Math.floor(maxSystemPromptTokens * 0.2)),
  );

  return {
    maxSystemPromptTokens,
    maxUserPromptTokens,
    maxRetrievedPromptTokens,
    maxSectionTokens,
  };
};

const compactSection = (
  value: string | undefined,
  maxTokens: number,
  maxChars = EXTRA_SECTION_MAX,
): string => {
  if (!value?.trim()) {
    return '';
  }
  return clampTextByTokenBudget(value, maxTokens, maxChars);
};

const toRoleLabel = (role: PromptTurnMessage['role']): string =>
  role === 'assistant' ? 'Assistant' : 'User';

const buildNativeRecentTurns = (messages: PromptTurnMessage[]): string => {
  const tail = messages.slice(-NATIVE_RECENT_TURNS_MAX);
  if (!tail.length) {
    return '';
  }

  const lines = tail
    .map((message) => `- ${toRoleLabel(message.role)}: ${clampTextByTokenBudget(message.content, NATIVE_RECENT_TURN_MAX_TOKENS, NATIVE_RECENT_TURN_CHARS)}`)
    .join('\n');

  return lines ? `## Recent chat turns\n${lines}` : '';
};

export const buildTrimmedConversationHistory = (
  messages: PromptTurnMessage[],
  options: HistoryTrimOptions = {},
): PromptTurnMessage[] => {
  const maxTurns = options.maxTurns ?? DEFAULT_HISTORY_TURNS;
  const maxCharsPerMessage = options.maxCharsPerMessage ?? DEFAULT_HISTORY_MESSAGE_CHARS;
  const maxTokensPerMessage = options.maxTokensPerMessage ?? Math.max(48, Math.floor(maxCharsPerMessage / 4));

  return messages
    .filter((message) => message.content?.trim())
    .slice(-Math.max(1, maxTurns))
    .map((message) => ({
      role: message.role,
      content: clampTextByTokenBudget(
        message.content,
        Math.max(12, maxTokensPerMessage),
        Math.max(48, maxCharsPerMessage),
      ),
    }));
};

export const composeTurnPrompts = (options: ComposeTurnPromptOptions): ComposeTurnPromptResult => {
  const {
    provider,
    modelId,
    context,
    userMessage,
    retrievedMemoryPrompt,
    extraContextSections = [],
    addConversationalContinuity = false,
    forceCasualCompanionMode = false,
    includeCrisisAugment,
    recentConversation = [],
    budget,
  } = options;

  const isNative = provider === 'native-cpu';
  const recommendedBudget = getRecommendedContextBudget(modelId, provider);
  const resolvedBudget = resolvePromptBudget(provider, {
    modelContextTokens: budget?.modelContextTokens ?? recommendedBudget.modelContextTokens,
    reservedResponseTokens: budget?.reservedResponseTokens ?? recommendedBudget.reservedResponseTokens,
    maxInputTokens: budget?.maxInputTokens ?? recommendedBudget.maxInputTokens,
    maxSystemPromptTokens: budget?.maxSystemPromptTokens,
    maxUserPromptTokens: budget?.maxUserPromptTokens,
    maxRetrievedPromptTokens: budget?.maxRetrievedPromptTokens,
    maxSectionTokens: budget?.maxSectionTokens,
  });

  const userPrompt = clampTextByTokenBudget(
    userMessage,
    resolvedBudget.maxUserPromptTokens,
    isNative ? NATIVE_USER_PROMPT_MAX : WEB_USER_PROMPT_MAX,
  );

  const compactRetrieved = compactSection(
    retrievedMemoryPrompt,
    resolvedBudget.maxRetrievedPromptTokens,
    RETRIEVAL_PROMPT_MAX,
  );
  const compactSections = extraContextSections
    .map((section) => compactSection(section, resolvedBudget.maxSectionTokens, EXTRA_SECTION_MAX))
    .filter(Boolean);

  let systemPrompt = mentalHealthPromptService.composePrompt({
    context,
    userMessage: userPrompt,
    retrievedMemoryPrompt: compactRetrieved,
    extraContextSections: compactSections,
    addConversationalContinuity,
    forceCasualCompanionMode,
    includeCrisisAugment,
  });

  systemPrompt = `${UNIVERSAL_SYSTEM_IDENTITY_POLICY}\n\n${INTERNAL_REASONING_CHAIN_POLICY}\n\n${systemPrompt}`;

  if (isNative) {
    const recentTurns = buildNativeRecentTurns(recentConversation);
    systemPrompt = [NATIVE_IDENTITY_GUARD, systemPrompt, recentTurns]
      .filter((section) => section && section.trim())
      .join('\n\n');
  }

  systemPrompt = clampTextByTokenBudget(
    systemPrompt,
    resolvedBudget.maxSystemPromptTokens,
    isNative ? NATIVE_SYSTEM_PROMPT_MAX : WEB_SYSTEM_PROMPT_MAX,
  );

  return {
    systemPrompt,
    userPrompt,
  };
};
