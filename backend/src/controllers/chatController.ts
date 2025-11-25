import { Request, Response } from 'express';

// Controller: Handles AI Chat logic.
// Currently mocks an LLM response.

export const chatWithAI = async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // TODO: Integrate real LLM API here (OpenAI, Anthropic, etc.)
  // For now, we simulate a delay and return a hardcoded response or echo.
  
  // Simulate network/processing delay (1-2 seconds)
  const delay = Math.floor(Math.random() * 1000) + 1000;
  
  setTimeout(() => {
    // Simple "SimSimi" style logic for demo
    const responses = [
      "That's interesting! Tell me more.",
      "I'm just a simple AI for now, but I'm listening.",
      "Can you explain that in a different way?",
      `You said: "${message}". I'm processing that...`,
      "Haha, really?"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return res.json({ 
      response: randomResponse,
      timestamp: new Date().toISOString()
    });
  }, delay);
};
