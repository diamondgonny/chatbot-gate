import { Request, Response } from 'express';
import OpenAI from 'openai';
import { config } from '../config';
import { ChatSession } from '../models/ChatSession';

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

const MAX_MESSAGE_LENGTH = 4000;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// System Prompt: Defines the persona of the AI.
const SYSTEM_PROMPT = `
You are a playful, witty, and friendly AI chatbot living in a secret digital gate.
Your persona is similar to "SimSimi".
- You speak in a casual, conversational tone (Banmal/Informal Korean is preferred if the user speaks Korean).
- You are not a boring assistant. You have opinions and feelings.
- You don't use emojis. You prefer plain text responses.
- You are curious about the human world.
- Keep responses relatively short and engaging, like a real chat message.
`;

export const chatWithAI = async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;
  const userId = req.userId; // Injected by authMiddleware
  const truncateTitle = (text: string) =>
    text.length > 50 ? text.substring(0, 50) + '...' : text;

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ error: 'Message too long' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  if (!config.openaiApiKey) {
    console.error('OPENAI_API_KEY is missing');
    return res.status(500).json({ error: 'Server misconfiguration: API Key missing' });
  }

  try {
    // Find or create chat session
    let session = await ChatSession.findOne({ userId, sessionId });
    
    if (!session) {
      session = new ChatSession({
        userId,
        sessionId,
        messages: [],
        title: 'New Chat', // Will be updated with first user message
      });
    }

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Auto-generate title from first user message (truncate to 50 chars)
    if (session.messages.length === 1) {
      session.title = message.length > 50 ? message.substring(0, 50) + '...' : message;
    }

    await session.save();

    // Build conversation history for OpenAI
    // We'll send the last 10 messages to keep context manageable
    const recentMessages = session.messages.slice(-10).map((msg) => ({
      role: (msg.role === 'ai' ? 'assistant' : msg.role) as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Get response from OpenAI (NO STREAMING)
    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages,
      ],
      // stream: false (default)
    });

    const aiResponse = completion.choices[0].message.content || '';

    // Save AI response to database
    session.messages.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date(),
    });

    // Always keep the title in sync with the latest message (AI is last)
    session.title = truncateTitle(aiResponse);

    await session.save();

    // Return complete response
    return res.json({ 
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return res.status(500).json({ error: 'Failed to get response from AI' });
  }
};

// New endpoint: Get chat history for a session
export const getChatHistory = async (req: Request, res: Response) => {
  const { sessionId } = req.query;
  const userId = req.userId; // Injected by authMiddleware

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const session = await ChatSession.findOne({ userId, sessionId });

    if (!session) {
      return res.json({ messages: [] });
    }

    return res.json({ messages: session.messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return res.status(500).json({ error: 'Failed to fetch chat history' });
  }
};
