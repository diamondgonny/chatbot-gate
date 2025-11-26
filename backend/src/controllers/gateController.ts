import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { signToken } from '../utils/jwtUtils';

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
    // Generate a new session ID (UUID)
    const sessionId = uuidv4();
    
    // Sign JWT token with sessionId in payload
    const token = signToken(sessionId);
    
    return res.json({ 
      valid: true, 
      message: 'Access granted',
      sessionId,  // Send sessionId for client storage
      token,      // Send JWT for authentication
    });
  } else {
    return res.status(401).json({ valid: false, message: 'Invalid code' });
  }
};
