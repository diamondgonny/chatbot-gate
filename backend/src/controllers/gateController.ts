import { Request, Response } from 'express';
import { config } from '../config';

// Controller: Handles the business logic for incoming requests.
// In Spring, this would be a method inside a @RestController class.
// In FastAPI, this is the function decorated with @app.post(...).

export const validateGateCode = (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ valid: false, message: 'Code is required' });
  }

  // Check if the provided code exists in our allowed list
  const isValid = config.validCodes.includes(code);

  if (isValid) {
    // In a real app, we might generate a JWT token here.
    // For now, we'll just return a success flag.
    return res.json({ 
      valid: true, 
      message: 'Access granted',
      // Simple session token simulation
      token: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
  } else {
    return res.status(401).json({ valid: false, message: 'Invalid code' });
  }
};
