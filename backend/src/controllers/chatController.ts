import { Request, Response } from 'express';
import OpenAI from 'openai';
import { config } from '../config';

// Initialize OpenAI Client
// Note: It will automatically look for OPENAI_API_KEY in process.env if not passed,
// but passing it explicitly from our config is safer/clearer.
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// System Prompt: Defines the persona of the AI.
// We want a "SimSimi" or "Lee Luda" vibe: casual, friendly, playful, maybe a bit sassy.
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
    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      // We are NOT streaming yet, just a simple request/response
    });

    const aiResponse = completion.choices[0].message.content;

    return res.json({ 
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return res.status(500).json({ error: 'Failed to get response from AI' });
  }
};
