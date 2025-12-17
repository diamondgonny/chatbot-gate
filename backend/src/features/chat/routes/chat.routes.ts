import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  sendChatMessage,
} from '../controllers/chat.controller';
import { authMiddleware, createRateLimiter } from '@shared';

const router = Router();

// 모든 chat 라우트에 인증 미들웨어 적용
router.use(authMiddleware);

// POST /api/chat/sessions - 새 세션 생성
router.post(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 100, routeName: 'chat_session_create' }),
  createSession
);

// GET /api/chat/sessions - 모든 세션 조회
router.get(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 300, routeName: 'chat_session_list' }),
  getSessions
);

// GET /api/chat/sessions/:sessionId - 특정 세션 상세 조회
router.get(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 600, routeName: 'chat_session_get' }),
  getSession
);

// DELETE /api/chat/sessions/:sessionId - 세션 삭제
router.delete(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 200, routeName: 'chat_session_delete' }),
  deleteSession
);

// POST /api/chat/sessions/:sessionId/message - AI에 메시지 전송
router.post(
  '/sessions/:sessionId/message',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'chat_message' }),
  sendChatMessage
);

export default router;
