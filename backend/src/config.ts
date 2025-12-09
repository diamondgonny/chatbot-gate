import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  // Parse the comma-separated list of codes into an array
  validCodes: (process.env.VALID_CODES || '').split(',').map(code => code.trim()),
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-5.1-chat-latest',
  mongoUri: process.env.MONGO_URI || '',
  // JWT Configuration
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  // OpenRouter API for Council feature
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
};

// Environment detection
const getEnvironment = (): 'production' | 'development' => {
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'production' ? 'production' : 'development';
};

// Cookie configuration interface
interface CookieConfig {
  domain: string | undefined;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

// Cookie configuration factory
const getCookieConfig = (): CookieConfig => {
  const environment = getEnvironment();

  // Explicit env var overrides (highest priority)
  const explicitDomain = process.env.COOKIE_DOMAIN;
  const explicitSecure = process.env.COOKIE_SECURE;
  const explicitSameSite = process.env.COOKIE_SAMESITE;

  // Environment-based defaults
  let domain: string | undefined;
  let secure: boolean;
  let sameSite: 'strict' | 'lax' | 'none' = 'lax';

  if (environment === 'production') {
    domain = '.chatbotgate.click';
    secure = true;
  } else {
    // development
    domain = undefined; // Browser uses exact origin (localhost)
    secure = false;     // Allow HTTP for localhost
  }

  // Apply explicit overrides if provided
  if (explicitDomain !== undefined) {
    domain = explicitDomain === '' ? undefined : explicitDomain;
  }

  if (explicitSecure !== undefined) {
    secure = explicitSecure === 'true';
  }

  if (explicitSameSite && ['strict', 'lax', 'none'].includes(explicitSameSite)) {
    sameSite = explicitSameSite as 'strict' | 'lax' | 'none';
  }

  return { domain, secure, sameSite };
};

export const cookieConfig = getCookieConfig();

// Security validation warnings
const environment = getEnvironment();
if (environment === 'production' && !cookieConfig.secure) {
  console.warn('⚠️  WARNING: Cookie secure flag disabled in production!');
}

if (environment === 'production' && !cookieConfig.domain) {
  console.warn('⚠️  WARNING: No cookie domain in production - may not work across subdomains');
}

// Startup logging
console.log('Cookie Configuration:', {
  environment,
  domain: cookieConfig.domain || '(browser default)',
  secure: cookieConfig.secure,
  sameSite: cookieConfig.sameSite,
});
