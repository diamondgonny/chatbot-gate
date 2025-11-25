import { Request, Response } from 'express';
import OpenAI from 'openai';
import { config } from '../config';

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
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!config.openaiApiKey) {
    console.error('OPENAI_API_KEY is missing');
    return res.status(500).json({ error: 'Server misconfiguration: API Key missing' });
  }

  try {
    // Enable streaming for a typewriter effect
    const stream = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      stream: true, // KEY CHANGE: Enable streaming
    });

    // Set headers for Server-Sent Events (SSE)
    // This allows us to send data to the client incrementally.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream chunks to the client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        // SSE format: data: <content>\n\n
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send a completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    
    // If headers are not sent yet, send an error response
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to get response from AI' });
    } else {
      // If streaming already started, send error via SSE
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    }
  }
};
