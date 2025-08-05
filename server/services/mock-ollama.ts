import type { GrammarSuggestion, MessageFeedback, ChatMode, FocusMode } from "@shared/schema";

export interface ChatResponse {
  content: string;
  grammarSuggestions: GrammarSuggestion[];
  feedback?: MessageFeedback;
}

export class MockOllamaService {
  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const responses = {
      conversation: [
        "That's interesting! Tell me more about that.",
        "I understand. How do you feel about it?",
        "That sounds great! What happened next?",
        "I see what you mean. Can you give me an example?",
        "That's a good point. What do you think about it?"
      ],
      interview: [
        "Thank you for that response. Can you tell me about a time when you faced a challenge at work?",
        "That's a good example. How do you handle stress in the workplace?",
        "Interesting. What are your greatest strengths?",
        "I see. Where do you see yourself in 5 years?",
        "Thank you. Do you have any questions for me about this position?"
      ],
      roleplay: [
        "Welcome! How can I help you today?",
        "Certainly! Let me check that for you.",
        "That sounds perfect. Would you like anything else?",
        "Of course! Is there anything specific you're looking for?",
        "Thank you for choosing us. Have a great day!"
      ]
    };
    
    const modeResponses = responses[mode] || responses.conversation;
    const randomResponse = modeResponses[Math.floor(Math.random() * modeResponses.length)];
    
    // Mock grammar suggestions for correction focus
    const grammarSuggestions: GrammarSuggestion[] = focus === 'correction' && Math.random() > 0.7 ? [
      {
        original: "good",
        suggestion: "well",
        reason: "Use 'well' as an adverb",
        startIndex: 0,
        endIndex: 4
      }
    ] : [];
    
    // Mock feedback
    const feedback: MessageFeedback = {
      type: "encouragement",
      title: "Great job!",
      message: "You're making excellent progress with your English!",
      icon: "thumbs-up"
    };
    
    return {
      content: `[MOCK MODE] ${randomResponse}`,
      grammarSuggestions,
      feedback: Math.random() > 0.5 ? feedback : undefined,
    };
  }

  async regenerateResponse(
    originalMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const alternativeResponses = [
      "Let me give you a different perspective on that...",
      "Here's another way to think about it...", 
      "That's an interesting question. Let me approach it differently...",
      "I can see it from another angle too...",
      "Here's an alternative response..."
    ];
    
    const randomResponse = alternativeResponses[Math.floor(Math.random() * alternativeResponses.length)];
    
    return {
      content: `[MOCK REGENERATION] ${randomResponse}`,
      grammarSuggestions: [],
      feedback: undefined,
    };
  }
}

export const mockOllamaService = new MockOllamaService();
