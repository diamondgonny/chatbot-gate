/**
 * 설정 모듈
 *
 * 주의: dotenv.config()는 이 모듈을 import하기 전에
 * 엔트리포인트(index.ts)에서 호출해야 함
 */

export const config = {
  port: process.env.PORT || 4000,
  // 쉼표로 구분된 코드 목록을 배열로 파싱 (빈 문자열 제거)
  validCodes: (process.env.VALID_CODES || '').split(',').map(code => code.trim()).filter(Boolean),
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-5.1-chat-latest',
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
};

const getEnvironment = (): 'production' | 'development' => {
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'production' ? 'production' : 'development';
};

interface CookieConfig {
  domain: string | undefined;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

/**
 * 쿠키 설정 팩토리
 *
 * 우선순위:
 * 1. 명시적 환경변수 (COOKIE_DOMAIN, COOKIE_SECURE, COOKIE_SAMESITE)
 *    - 특수 케이스(스테이징, 커스텀 도메인 등)에서 기본값 오버라이드
 * 2. 환경별 기본값 (NODE_ENV 기반)
 *    - 프로덕션: 서브도메인 공유를 위한 .chatbotgate.click, HTTPS 필수
 *    - 개발: localhost에서 HTTP 허용, 도메인 미지정
 */
const getCookieConfig = (): CookieConfig => {
  const environment = getEnvironment();

  // 1순위: 명시적 환경변수 오버라이드
  const explicitDomain = process.env.COOKIE_DOMAIN;
  const explicitSecure = process.env.COOKIE_SECURE;
  const explicitSameSite = process.env.COOKIE_SAMESITE;

  // 2순위: 환경별 기본값
  let domain: string | undefined;
  let secure: boolean;
  let sameSite: 'strict' | 'lax' | 'none' = 'lax';

  if (environment === 'production') {
    // 서브도메인(api.*, www.* 등) 간 쿠키 공유를 위해 도트 프리픽스
    domain = '.chatbotgate.click';
    secure = true;  // HTTPS 필수
  } else {
    domain = undefined;  // 브라우저가 정확한 origin 사용 (localhost)
    secure = false;      // localhost에서 HTTP 허용
  }

  // 명시적 오버라이드 적용
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

/** 쿠키 설정 로깅 (엔트리포인트에서 호출) */
export const logCookieConfig = (): void => {
  const environment = getEnvironment();

  // 프로덕션 보안 경고
  if (environment === 'production' && !cookieConfig.secure) {
    console.warn('⚠️  WARNING: 프로덕션에서 Cookie secure 플래그가 비활성화됨!');
  }

  if (environment === 'production' && !cookieConfig.domain) {
    console.warn('⚠️  WARNING: 프로덕션에서 Cookie domain 미설정 - 서브도메인 간 쿠키 공유 불가');
  }

  console.log('Cookie Configuration:', {
    environment,
    domain: cookieConfig.domain || '(browser default)',
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
  });
};
