import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { signToken } from '../utils/jwtUtils';

// Controller: Handles the business logic for incoming requests.
// In Spring, this would be a method inside a @RestController class.
// In FastAPI, this is the function decorated with @app.post(...).

export const validateGateCode = (req: Request, res: Response) => {
  const { code, userId: existingUserId } = req.body;

  if (!code) {
    return res.status(400).json({ valid: false, message: 'Code is required' });
  }

  // Check if the provided code exists in our allowed list
  const isValid = config.validCodes.includes(code);

  if (isValid) {
    // Reuse existing userId or generate new one
    const userId = existingUserId || uuidv4();
    
    // Sign JWT token with userId in payload
    const token = signToken(userId);
    
    // Set JWT as HttpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    return res.json({ 
      valid: true, 
      message: 'Access granted',
      userId,  // Send userId for client storage
    });
  } else {
    return res.status(401).json({ valid: false, message: 'Invalid code' });
  }
};
