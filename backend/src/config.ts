import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  // Parse the comma-separated list of codes into an array
  validCodes: (process.env.VALID_CODES || '').split(',').map(code => code.trim()),
};
