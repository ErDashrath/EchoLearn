import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ollamaService } from "./services/ollama";
import { insertChatSessionSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for Ollama
  app.get("/api/ollama/health", async (req, res) => {
    try {
      const healthStatus = await ollamaService.healthCheck();
      res.json(healthStatus);
    } catch (error) {
      res.status(500).json({ 
        error: "Health check failed", 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Chat session routes
  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const validatedData = insertChatSessionSchema.parse(req.body);
      const session = await storage.createChatSession(validatedData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid session data" 
      });
    }
  });

  app.get("/api/chat/sessions", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const sessions = await storage.getUserChatSessions(userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch chat sessions" 
      });
    }
  });

  app.get("/api/chat/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch chat session" 
      });
    }
  });

  app.patch("/api/chat/sessions/:id", async (req, res) => {
    try {
      const updates = req.body;
      const session = await storage.updateChatSession(req.params.id, updates);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to update chat session" 
      });
    }
  });

  // Message routes
  app.get("/api/chat/sessions/:sessionId/messages", async (req, res) => {
    try {
      const messages = await storage.getSessionMessages(req.params.sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch messages" 
      });
    }
  });

  app.post("/api/chat/sessions/:sessionId/messages", async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const session = await storage.getChatSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      const messageSchema = insertMessageSchema.extend({
        content: z.string().min(1, "Message content is required"),
      });

      const validatedData = messageSchema.parse({
        ...req.body,
        sessionId,
      });

      // Create user message
      const userMessage = await storage.createMessage(validatedData);

      // Get conversation history
      const messages = await storage.getSessionMessages(sessionId);
      const conversationHistory = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Generate AI response
      const aiResponse = await ollamaService.generateResponse(
        validatedData.content,
        conversationHistory,
        session.mode as any,
        session.focus as any
      );

      // Create AI message
      const aiMessage = await storage.createMessage({
        sessionId,
        content: aiResponse.content,
        role: 'assistant',
        grammarSuggestions: aiResponse.grammarSuggestions,
        feedback: aiResponse.feedback,
      });

      // Update user message with grammar suggestions if any
      if (aiResponse.grammarSuggestions.length > 0) {
        await storage.updateMessage(userMessage.id, {
          grammarSuggestions: aiResponse.grammarSuggestions
        });
      }

      res.json({
        userMessage: {
          ...userMessage,
          grammarSuggestions: aiResponse.grammarSuggestions
        },
        aiMessage
      });
    } catch (error) {
      console.error('Chat message error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process message" 
      });
    }
  });

  // Regenerate AI response
  app.post("/api/chat/messages/:messageId/regenerate", async (req, res) => {
    try {
      const message = await storage.getSessionMessages(req.body.sessionId);
      const targetMessage = message.find(m => m.id === req.params.messageId);
      
      if (!targetMessage || targetMessage.role !== 'assistant') {
        return res.status(404).json({ message: "AI message not found" });
      }

      const session = await storage.getChatSession(targetMessage.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      // Get the user message that preceded this AI message
      const messageIndex = message.findIndex(m => m.id === req.params.messageId);
      const userMessage = messageIndex > 0 ? message[messageIndex - 1] : null;
      
      if (!userMessage || userMessage.role !== 'user') {
        return res.status(400).json({ message: "Cannot regenerate without user message context" });
      }

      // Get conversation history up to the user message
      const conversationHistory = message
        .slice(0, messageIndex)
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      // Generate new AI response
      const aiResponse = await ollamaService.regenerateResponse(
        userMessage.content,
        conversationHistory,
        session.mode as any,
        session.focus as any
      );

      // Update the AI message
      const updatedMessage = await storage.updateMessage(targetMessage.id, {
        content: aiResponse.content,
        feedback: aiResponse.feedback,
      });

      res.json(updatedMessage);
    } catch (error) {
      console.error('Regenerate message error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to regenerate message" 
      });
    }
  });

  // Export chat session
  app.get("/api/chat/sessions/:sessionId/export/:format", async (req, res) => {
    try {
      const { sessionId, format } = req.params;
      const session = await storage.getChatSession(sessionId);
      const messages = await storage.getSessionMessages(sessionId);

      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      let exportData: string;
      let contentType: string;
      let filename: string;

      switch (format) {
        case 'txt':
          exportData = messages
            .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n');
          contentType = 'text/plain';
          filename = `chat-${sessionId}.txt`;
          break;

        case 'md':
          exportData = messages
            .map(msg => `## ${msg.role === 'user' ? 'You' : 'AI Tutor'}\n\n${msg.content}`)
            .join('\n\n');
          contentType = 'text/markdown';
          filename = `chat-${sessionId}.md`;
          break;

        case 'json':
          exportData = JSON.stringify({
            session,
            messages,
            exportedAt: new Date().toISOString()
          }, null, 2);
          contentType = 'application/json';
          filename = `chat-${sessionId}.json`;
          break;

        default:
          return res.status(400).json({ message: "Unsupported format" });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ 
        message: "Failed to export chat session" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
