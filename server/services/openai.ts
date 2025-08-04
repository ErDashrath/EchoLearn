import OpenAI from "openai";
import type { GrammarSuggestion, MessageFeedback, ChatMode, FocusMode } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ChatResponse {
  content: string;
  grammarSuggestions: GrammarSuggestion[];
  feedback?: MessageFeedback;
}

export class OpenAIService {
  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    try {
      const systemPrompt = this.getSystemPrompt(mode, focus);
      
      // First, get the main response
      const chatResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.slice(-10), // Keep last 10 messages for context
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = chatResponse.choices[0].message.content || '';

      // Analyze user message for grammar suggestions if focus is on correction
      let grammarSuggestions: GrammarSuggestion[] = [];
      let feedback: MessageFeedback | undefined;

      if (focus === 'correction') {
        grammarSuggestions = await this.analyzeGrammar(userMessage);
      }

      // Generate learning feedback
      feedback = await this.generateFeedback(userMessage, mode, focus);

      return {
        content,
        grammarSuggestions,
        feedback,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate AI response. Please try again.');
    }
  }

  private getSystemPrompt(mode: ChatMode, focus: FocusMode): string {
    const basePrompt = `You are an AI English tutor helping students improve their English skills. Be encouraging, patient, and provide constructive feedback.`;
    
    const modeInstructions = {
      conversation: "Engage in natural, friendly conversation. Ask follow-up questions and keep the dialogue flowing naturally.",
      interview: "Act as a professional interviewer. Ask common job interview questions and provide feedback on answers. Be professional but supportive.",
      roleplay: "Engage in roleplay scenarios to help practice real-world English usage. Adapt to different situations like ordering food, asking for directions, etc."
    };

    const focusInstructions = {
      fluency: "Focus on maintaining natural conversation flow. Don't interrupt with corrections unless they significantly impact understanding.",
      correction: "Pay attention to grammar, vocabulary, and sentence structure. Provide gentle corrections when appropriate."
    };

    return `${basePrompt}\n\nMode: ${modeInstructions[mode]}\n\nFocus: ${focusInstructions[focus]}\n\nRespond naturally and conversationally.`;
  }

  private async analyzeGrammar(text: string): Promise<GrammarSuggestion[]> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a grammar checker. Analyze the text and identify grammar errors. Return a JSON array of grammar suggestions with the format: [{\"original\": \"incorrect text\", \"suggestion\": \"corrected text\", \"reason\": \"explanation\", \"startIndex\": 0, \"endIndex\": 10}]. Only include actual errors, not stylistic preferences."
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
      return result.suggestions || [];
    } catch (error) {
      console.error('Grammar analysis error:', error);
      return [];
    }
  }

  private async generateFeedback(text: string, mode: ChatMode, focus: FocusMode): Promise<MessageFeedback | undefined> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Generate encouraging feedback for an English learner. Return JSON with format: {"type": "progress|encouragement|grammar", "title": "short title", "message": "encouraging message", "icon": "icon name"}. Keep it positive and constructive. Mode: ${mode}, Focus: ${focus}`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.type ? result : undefined;
    } catch (error) {
      console.error('Feedback generation error:', error);
      return undefined;
    }
  }

  async regenerateResponse(
    originalMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    // Similar to generateResponse but with higher temperature for variety
    try {
      const systemPrompt = this.getSystemPrompt(mode, focus);
      
      const chatResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt + "\n\nProvide an alternative response with a different approach or tone." },
          ...conversationHistory.slice(-10),
          { role: "user", content: originalMessage }
        ],
        temperature: 0.9, // Higher temperature for more variety
        max_tokens: 500,
      });

      const content = chatResponse.choices[0].message.content || '';

      return {
        content,
        grammarSuggestions: [],
        feedback: undefined,
      };
    } catch (error) {
      console.error('OpenAI regenerate error:', error);
      throw new Error('Failed to regenerate response. Please try again.');
    }
  }
}

export const openAIService = new OpenAIService();
