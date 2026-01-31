// Simplified schema for client-side usage (removed database-specific parts)
import { z } from "zod";

export interface GrammarSuggestion {
  original: string;
  suggestion: string;
  reason: string;
  startIndex: number;
  endIndex: number;
}

export interface MessageFeedback {
  type: 'grammar' | 'progress' | 'encouragement';
  title: string;
  message: string;
  icon?: string;
}

export interface Message {
  id: string;
  sessionId?: string;
  content: string;
  role: 'user' | 'assistant';
  grammarSuggestions?: GrammarSuggestion[] | null;
  feedback?: MessageFeedback | null;
  createdAt?: Date | string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  focus: FocusMode;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export const chatModes = ['conversation', 'interview', 'roleplay'] as const;
export const focusModes = ['fluency', 'correction'] as const;
export type ChatMode = typeof chatModes[number];
export type FocusMode = typeof focusModes[number];

// Zod schemas for validation
export const MessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant']),
  grammarSuggestions: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
    reason: z.string(),
    startIndex: z.number(),
    endIndex: z.number(),
  })).optional(),
  feedback: z.object({
    type: z.enum(['grammar', 'progress', 'encouragement']),
    title: z.string(),
    message: z.string(),
    icon: z.string().optional(),
  }).optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});

export const ChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: z.enum(chatModes),
  focus: z.enum(focusModes),
  createdAt: z.union([z.date(), z.string()]).optional(),
  updatedAt: z.union([z.date(), z.string()]).optional(),
});
