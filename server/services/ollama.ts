import type { GrammarSuggestion, MessageFeedback, ChatMode, FocusMode } from "@shared/schema";
import { MockOllamaService } from "./mock-ollama";

export interface ChatResponse {
  content: string;
  grammarSuggestions: GrammarSuggestion[];
  feedback?: MessageFeedback;
}

export class OllamaService {
  private baseUrl: string;
  private fallbackUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.fallbackUrl = process.env.OLLAMA_FALLBACK_URL || "http://localhost:11434";
    console.log(`🚀 Ollama Service initialized:`);
    console.log(`   Primary URL: ${this.baseUrl}`);
    console.log(`   Fallback URL: ${this.fallbackUrl}`);
  }

  async healthCheck(): Promise<{ primary: boolean; fallback: boolean; details: any }> {
    const results = { 
      primary: false, 
      fallback: false, 
      details: { primary: {}, fallback: {} } as any 
    };
    
    // Test primary URL
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'Mindscribe/1.0'
        },
        mode: this.baseUrl.includes('localhost') ? 'same-origin' : 'cors',
      });
      results.primary = response.ok;
      results.details.primary = { status: response.status, statusText: response.statusText };
    } catch (error) {
      results.details.primary = { error: error instanceof Error ? error.message : String(error) };
    }

    // Test fallback URL
    try {
      const response = await fetch(`${this.fallbackUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      results.fallback = response.ok;
      results.details.fallback = { status: response.status, statusText: response.statusText };
    } catch (error) {
      results.details.fallback = { error: error instanceof Error ? error.message : String(error) };
    }

    return results;
  }

  private async makeOllamaRequest(url: string, body: any, timeout = 60000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`🔄 Attempting Ollama request to: ${url}`);
      console.log(`📤 Request body:`, JSON.stringify(body, null, 2));
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mindscribe/1.0",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        mode: url.includes('localhost') ? "same-origin" : "cors",
      });
      
      console.log(`📥 Response status: ${response.status} ${response.statusText}`);
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Request failed to ${url}:`, error);
      throw error;
    }
  }

  private async generateWithOllama(messages: Array<{ role: string; content: string }>, model: string = "llama3:latest"): Promise<string> {
    const requestBody = {
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 500,
      }
    };

    try {
      // Try primary URL first
      let response = await this.makeOllamaRequest(`${this.baseUrl}/api/chat`, requestBody);
      
      if (!response.ok) {
        console.warn(`Primary Ollama URL failed with status ${response.status}, trying fallback...`);
        // Try fallback URL
        response = await this.makeOllamaRequest(`${this.fallbackUrl}/api/chat`, requestBody);
      }

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error) {
      console.error('Ollama API error:', error);
      throw new Error('Failed to generate AI response. Please check if Ollama server is running.');
    }
  }

  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    try {
      const systemPrompt = this.getSystemPrompt(mode, focus);
      
      // Prepare messages for Ollama
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-10), // Keep last 10 messages for context
        { role: "user", content: userMessage }
      ];

      // Get the main response from Ollama
      const content = await this.generateWithOllama(messages);

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
      console.error('Ollama service error:', error);
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

    return `${basePrompt}\n\nMode: ${modeInstructions[mode]}\n\nFocus: ${focusInstructions[focus]}\n\nRespond naturally and conversationally. Keep responses concise and engaging.`;
  }

  private async analyzeGrammar(text: string): Promise<GrammarSuggestion[]> {
    try {
      const messages = [
        {
          role: "system",
          content: "You are a grammar checker. Analyze the text and identify grammar errors. Return a JSON array of grammar suggestions with the format: [{\"original\": \"incorrect text\", \"suggestion\": \"corrected text\", \"reason\": \"explanation\", \"startIndex\": 0, \"endIndex\": 10}]. Only include actual errors, not stylistic preferences. If no errors are found, return an empty array []."
        },
        { role: "user", content: text }
      ];

      const response = await this.generateWithOllama(messages);
      
      try {
        const result = JSON.parse(response);
        return Array.isArray(result) ? result : result.suggestions || [];
      } catch (parseError) {
        console.warn('Failed to parse grammar analysis response:', parseError);
        return [];
      }
    } catch (error) {
      console.error('Grammar analysis error:', error);
      return [];
    }
  }

  private async generateFeedback(text: string, mode: ChatMode, focus: FocusMode): Promise<MessageFeedback | undefined> {
    try {
      const messages = [
        {
          role: "system",
          content: `You are a feedback generator. Return ONLY a valid JSON object with this exact format: {"type": "encouragement", "title": "Great job!", "message": "You're making excellent progress!", "icon": "thumbs-up"}. Do not include any other text or explanation.`
        },
        { role: "user", content: text }
      ];

      const response = await this.generateWithOllama(messages);
      
      try {
        // Try to extract JSON from the response if it contains extra text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : response;
        
        const result = JSON.parse(jsonString);
        return result.type ? result : undefined;
      } catch (parseError) {
        console.warn('Failed to parse feedback response:', parseError);
        console.warn('Raw response:', response);
        return undefined;
      }
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
    try {
      const systemPrompt = this.getSystemPrompt(mode, focus);
      
      const messages = [
        { role: "system", content: systemPrompt + "\n\nProvide an alternative response with a different approach or tone." },
        ...conversationHistory.slice(-10),
        { role: "user", content: originalMessage }
      ];

      // Use higher temperature for more variety in regeneration
      const requestBody = {
        model: "llama3:latest",
        messages,
        stream: false,
        options: {
          temperature: 0.9, // Higher temperature for more variety
          num_predict: 500,
        }
      };

      let response = await this.makeOllamaRequest(`${this.baseUrl}/api/chat`, requestBody);
      
      if (!response.ok) {
        response = await this.makeOllamaRequest(`${this.fallbackUrl}/api/chat`, requestBody);
      }

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.message?.content || '';

      return {
        content,
        grammarSuggestions: [],
        feedback: undefined,
      };
    } catch (error) {
      console.error('Ollama regenerate error:', error);
      throw new Error('Failed to regenerate response. Please try again.');
    }
  }
}

// Service wrapper that falls back to mock service when Ollama is unavailable
class OllamaServiceWrapper {
  private ollamaService: OllamaService;
  private mockService: MockOllamaService;
  private useMock: boolean = false;

  constructor() {
    this.ollamaService = new OllamaService();
    this.mockService = new MockOllamaService();
  }

  async healthCheck(): Promise<{ primary: boolean; fallback: boolean; details: any; usingMock: boolean }> {
    const health = await this.ollamaService.healthCheck();
    
    // If both primary and fallback are down, switch to mock mode
    if (!health.primary && !health.fallback) {
      this.useMock = true;
      console.log('🔄 Switching to mock Ollama service for development');
    }
    
    return {
      ...health,
      usingMock: this.useMock
    };
  }

  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    if (this.useMock) {
      return this.mockService.generateResponse(userMessage, conversationHistory, mode, focus);
    }
    
    try {
      return await this.ollamaService.generateResponse(userMessage, conversationHistory, mode, focus);
    } catch (error) {
      console.log('🔄 Ollama service failed, falling back to mock service');
      console.log('Error details:', error instanceof Error ? error.message : String(error));
      this.useMock = true;
      return this.mockService.generateResponse(userMessage, conversationHistory, mode, focus);
    }
  }

  async regenerateResponse(
    originalMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: ChatMode,
    focus: FocusMode
  ): Promise<ChatResponse> {
    if (this.useMock) {
      return this.mockService.regenerateResponse(originalMessage, conversationHistory, mode, focus);
    }
    
    try {
      return await this.ollamaService.regenerateResponse(originalMessage, conversationHistory, mode, focus);
    } catch (error) {
      console.log('🔄 Ollama service failed, falling back to mock service');
      this.useMock = true;
      return this.mockService.regenerateResponse(originalMessage, conversationHistory, mode, focus);
    }
  }
}

export const ollamaService = new OllamaServiceWrapper();
