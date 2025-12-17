/**
 * Express 앱 팩토리
 * 프로덕션과 테스트 환경에 맞게 미들웨어를 구성한 Express 앱 생성
 */

import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { cookieConfig } from './shared/config';
import { errorHandler } from './shared/middleware';

import { gateRoutes } from './features/gate';
import { authRoutes } from './features/auth';
import { chatRoutes } from './features/chat';
import { councilRoutes } from './features/council';
import { metricsRoutes, metricsMiddleware } from './features/metrics';

export interface AppOptions {
  /** Morgan 요청 로깅 활성화 (기본값: true) */
  enableLogging?: boolean;
  /** 메트릭 미들웨어 및 라우트 활성화 (기본값: true) */
  enableMetrics?: boolean;
  /** CORS 미들웨어 활성화 (기본값: true) */
  enableCors?: boolean;
  /** 보안 헤더 활성화 (기본값: true) */
  enableSecurityHeaders?: boolean;
  /** Council 기능 라우트 활성화 (기본값: true) */
  enableCouncil?: boolean;
  /** 테스트용 간소화 CSRF 사용 (기본값: false) */
  testMode?: boolean;
}

/**
 * CSRF 미들웨어 팩토리
 * - 프로덕션: crypto 랜덤 토큰 (보안)
 * - 테스트: 정적 토큰 'test-csrf-token'
 *   (테스트 코드에서 토큰 값을 예측하여 헤더에 포함 가능)
 */
const createCsrfMiddleware = (testMode: boolean) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const csrfHeader = req.header('x-csrf-token');
    const csrfCookie = req.cookies?.csrfToken;
    const method = req.method.toUpperCase();
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // CSRF 토큰이 없으면 발급
    if (!csrfCookie) {
      const token = testMode
        ? 'test-csrf-token'
        : randomBytes(16).toString('hex');

      res.cookie('csrfToken', token, {
        httpOnly: false, // CSRF 토큰은 프론트엔드에서 읽어야 하므로 httpOnly: false
        sameSite: testMode ? 'lax' : cookieConfig.sameSite,
        secure: testMode ? false : cookieConfig.secure,
        domain: testMode ? undefined : cookieConfig.domain,
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      // 상태 변경 요청에 토큰 없으면 거부
      if (requiresCsrf) {
        return res.status(403).json({ error: 'CSRF token required' });
      }

      return next();
    }

    // 상태 변경 요청은 헤더와 쿠키 토큰이 일치해야 함
    if (requiresCsrf && csrfHeader !== csrfCookie) {
      return res.status(403).json({ error: 'CSRF token mismatch' });
    }

    next();
  };
};

/** 보안 헤더 미들웨어 */
const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';"
    );
  }
  next();
};


/** CORS 설정 생성 */
const createCorsConfig = () => {
  const allowedOrigins = (
    process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true); // 비브라우저 도구 허용 (curl 등)
      if (allowedOrigins.length === 0) {
        return callback(new Error('CORS origin not configured'), false);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
  };
};

/**
 * 미들웨어를 구성 가능한 Express 앱 생성
 *
 * @param options - 미들웨어 구성 옵션
 * @returns 구성된 Express 앱
 *
 * @example
 * // 프로덕션 (기본값)
 * const app = createApp();
 *
 * @example
 * // 테스트 (최소 미들웨어)
 * const app = createApp({
 *   enableLogging: false,
 *   enableMetrics: false,
 *   enableCors: false,
 *   enableSecurityHeaders: false,
 *   enableCouncil: false,
 *   testMode: true,
 * });
 */
export const createApp = (options?: AppOptions): Express => {
  const {
    enableLogging = true,
    enableMetrics = true,
    enableCors = true,
    enableSecurityHeaders = true,
    enableCouncil = true,
    testMode = false,
  } = options ?? {};

  const app = express();

  // 프록시 뒤에서 정확한 클라이언트 IP 획득 (레이트 리미팅, 로깅용)
  app.set('trust proxy', 1);

  // 메트릭 수집 (모든 요청 캡처를 위해 최상단에 배치)
  if (enableMetrics) {
    app.use(metricsMiddleware);
  }

  if (enableCors) {
    app.use(cors(createCorsConfig()));
  }

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  if (enableSecurityHeaders) {
    app.use(securityHeadersMiddleware);
  }

  // Morgan 로깅은 index.ts에서 조건부로 설정 (테스트 시 파일 시스템 작업 방지)

  app.use(createCsrfMiddleware(testMode));

  app.use('/api/gate', gateRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);

  if (enableCouncil) {
    app.use('/api/council', councilRoutes);
  }

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Chatbot Gate Backend is running' });
  });

  if (enableMetrics) {
    app.use('/metrics', metricsRoutes);
  }

  app.use(errorHandler);

  return app;
};

/** 최소 미들웨어로 테스트용 앱 생성 */
export const createTestApp = (): Express => {
  return createApp({
    enableLogging: false,
    enableMetrics: false,
    enableCors: false,
    enableSecurityHeaders: false,
    enableCouncil: false,
    testMode: true,
  });
};
