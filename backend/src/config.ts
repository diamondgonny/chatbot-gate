import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  // Parse the comma-separated list of codes into an array
  validCodes: (process.env.VALID_CODES || '').split(',').map(code => code.trim()),
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o-2024-11-20',
  mongoUri: process.env.MONGO_URI || '',
  // JWT Configuration
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};
