import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  mode: text("mode").notNull().default("conversation"), // conversation, interview, roleplay
  focus: text("focus").notNull().default("fluency"), // fluency, correction
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id).notNull(),
  content: text("content").notNull(),
  role: text("role").notNull(), // user, assistant
  grammarSuggestions: jsonb("grammar_suggestions").$type<GrammarSuggestion[]>().default([]),
  feedback: jsonb("feedback").$type<MessageFeedback>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const selectChatSessionSchema = createSelectSchema(chatSessions);
export const selectMessageSchema = createSelectSchema(messages);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

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

export const chatModes = ['conversation', 'interview', 'roleplay'] as const;
export const focusModes = ['fluency', 'correction'] as const;
export type ChatMode = typeof chatModes[number];
export type FocusMode = typeof focusModes[number];
