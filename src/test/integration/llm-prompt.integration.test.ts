import { describe, expect, it } from 'vitest';
import {
  buildTrimmedConversationHistory,
  composeTurnPrompts,
} from '@/services/llm-prompt-service';

describe('llm prompt integration', () => {
  it('composes prompt pack with RAG context and trimmed history', () => {
    const history = buildTrimmedConversationHistory(
      [
        { role: 'user', content: 'I feel stressed with classes and deadlines.' },
        { role: 'assistant', content: 'That sounds heavy. What is the most urgent deadline?' },
        { role: 'user', content: 'Tomorrow morning and I am panicking.' },
      ],
      { maxTurns: 2, maxCharsPerMessage: 120 },
    );

    expect(history).toHaveLength(2);

    const result = composeTurnPrompts({
      provider: 'native-cpu',
      modelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      context: {
        userName: 'Dash',
        sessionType: 'chat',
      },
      userMessage: 'Please help me calm down before study.',
      retrievedMemoryPrompt: '## Retrieved context\n- User prefers short breathing exercises.',
      addConversationalContinuity: true,
      recentConversation: history,
    });

    expect(result.systemPrompt).toContain('MindScribe');
    expect(result.systemPrompt).toContain('Retrieved context');
    expect(result.userPrompt).toContain('Please help me calm down');
  });
});
