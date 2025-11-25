import { Request, Response } from 'express';
import OpenAI from 'openai';
import { config } from '../config';
import { ChatSession } from '../models/ChatSession';

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// System Prompt: Defines the persona of the AI.
const SYSTEM_PROMPT = `
You are a playful, witty, and friendly AI chatbot living in a secret digital gate.
Your persona is similar to "SimSimi" or "Lee Luda".
- You speak in a casual, conversational tone (Banmal/Informal Korean is preferred if the user speaks Korean).
- You are not a boring assistant. You have opinions and feelings.
- You use emojis occasionally.
- You are curious about the human world.
- Keep responses relatively short and engaging, like a real chat message.
`;

export const chatWithAI = async (req: Request, res: Response) => {
  const { message, token } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!token) {
    return res.status(400).json({ error: 'Session token is required' });
  }

  if (!config.openaiApiKey) {
    console.error('OPENAI_API_KEY is missing');
    return res.status(500).json({ error: 'Server misconfiguration: API Key missing' });
  }

  try {
    // Find or create chat session
    let session = await ChatSession.findOne({ token });
    
    if (!session) {
      session = new ChatSession({
        token,
        messages: [],
      });
    }

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    await session.save();

    // Build conversation history for OpenAI
    // We'll send the last 10 messages to keep context manageable
    const recentMessages = session.messages.slice(-10).map((msg) => ({
      role: (msg.role === 'ai' ? 'assistant' : msg.role) as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Enable streaming for a typewriter effect
    const stream = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages,
      ],
      stream: true,
    });

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let aiResponse = '';

    // Stream chunks to the client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        aiResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Save AI response to database
    session.messages.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date(),
    });

    await session.save();

    // Send a completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to get response from AI' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    }
  }
};

// New endpoint: Get chat history for a session
export const getChatHistory = async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Session token is required' });
  }

  try {
    const session = await ChatSession.findOne({ token });

    if (!session) {
      return res.json({ messages: [] });
    }

    return res.json({ messages: session.messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return res.status(500).json({ error: 'Failed to fetch chat history' });
  }
};
