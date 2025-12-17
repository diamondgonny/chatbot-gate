import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  sendMessage,
  getProcessingStatus,
  reconnectToProcessing,
  abortProcessing,
} from '../controllers/council.controller';
import { authMiddleware, createRateLimiter } from '@shared';

const router = Router();

// 모든 council 라우트에 인증 미들웨어 적용
router.use(authMiddleware);

// POST /api/council/sessions - 새 세션 생성
router.post(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'council_create_session' }),
  createSession
);

// GET /api/council/sessions - 모든 세션 목록 조회
router.get(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_list_sessions' }),
  getSessions
);

// GET /api/council/sessions/:sessionId - 세션 상세 조회
router.get(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_get_session' }),
  getSession
);

// DELETE /api/council/sessions/:sessionId - 세션 삭제
router.delete(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_delete_session' }),
  deleteSession
);

// POST /api/council/sessions/:sessionId/message - SSE 스트리밍으로 메시지 전송
// 메시지 내용은 요청 body에 전달: { content: string }
router.post(
  '/sessions/:sessionId/message',
  createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'council_send_message' }),
  sendMessage
);

// GET /api/council/sessions/:sessionId/status - 처리 상태 확인
router.get(
  '/sessions/:sessionId/status',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_status' }),
  getProcessingStatus
);

// GET /api/council/sessions/:sessionId/reconnect - 처리 중인 세션에 재연결 (SSE)
router.get(
  '/sessions/:sessionId/reconnect',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_reconnect' }),
  reconnectToProcessing
);

// POST /api/council/sessions/:sessionId/abort - 명시적으로 처리 중단
router.post(
  '/sessions/:sessionId/abort',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_abort' }),
  abortProcessing
);

export default router;
