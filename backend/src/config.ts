import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  // Parse the comma-separated list of codes into an array
  validCodes: (process.env.VALID_CODES || '').split(',').map(code => code.trim()),
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o-2024-11-20',
  mongoUri: process.env.MONGO_URI || 'mongodb://admin:chatbotgate123@localhost:27017/chatbot_gate?authSource=admin',
};
