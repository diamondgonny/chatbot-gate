/**
 * Authentication Helper for Tests
 * Provides utilities for generating JWT tokens and cookies
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
const CSRF_TOKEN = 'test-csrf-token';

/**
 * Generate a valid JWT token for a user
 */
export const generateValidToken = (userId?: string): string => {
  const id = userId || randomUUID();
  return jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '24h' });
};

/**
 * Generate an expired JWT token
 */
export const generateExpiredToken = (userId?: string): string => {
  const id = userId || randomUUID();
  return jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '-1h' });
};

/**
 * Generate an invalid JWT token (signed with wrong secret)
 */
export const generateInvalidToken = (userId?: string): string => {
  const id = userId || randomUUID();
  return jwt.sign({ userId: id }, 'wrong-secret', { expiresIn: '24h' });
};

/**
 * Generate a new user ID
 */
export const generateUserId = (): string => {
  return randomUUID();
};

/**
 * Get cookie string for authenticated requests
 */
export const getAuthCookies = (userId?: string): string => {
  const token = generateValidToken(userId);
  return `jwt=${token}; csrfToken=${CSRF_TOKEN}`;
};

/**
 * Get CSRF token for headers
 */
export const getCsrfToken = (): string => {
  return CSRF_TOKEN;
};

/**
 * Helper to set up authenticated request with supertest
 * Usage: request(app).post('/api/...').set(...withAuth())
 */
export const withAuth = (userId?: string): Record<string, string> => {
  const token = generateValidToken(userId);
  return {
    Cookie: `jwt=${token}; csrfToken=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
};

/**
 * Helper to set up CSRF headers only (for unauthenticated POST requests)
 */
export const withCsrf = (): Record<string, string> => {
  return {
    Cookie: `csrfToken=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
};
