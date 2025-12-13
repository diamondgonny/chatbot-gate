/**
 * Environment Validation
 * Centralized validation for required environment variables.
 */

export interface RequiredEnv {
  JWT_SECRET: string;
  MONGO_URI: string;
}

/**
 * Validate required environment variables at startup.
 * Exits process if any required variable is missing.
 *
 * @returns Validated environment variables
 */
export const validateEnv = (): RequiredEnv => {
  const missing: string[] = [];

  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.MONGO_URI) missing.push('MONGO_URI');

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  return {
    JWT_SECRET: process.env.JWT_SECRET!,
    MONGO_URI: process.env.MONGO_URI!,
  };
};
