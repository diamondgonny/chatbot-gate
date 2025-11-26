import jwt from 'jsonwebtoken';
import { config } from '../config';

// JWT Payload Interface
export interface JWTPayload {
  userId: string;
}

/**
 * Signs a JWT token with the given userId
 * @param userId - The UUID user identifier
 * @returns Signed JWT token string
 */
export const signToken = (userId: string): string => {
  const payload: JWTPayload = { userId };
  
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
};

/**
 * Verifies and decodes a JWT token
 * @param token - The JWT token string
 * @returns Decoded payload with userId
 * @throws Error if token is invalid or expired
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw error;
  }
};
