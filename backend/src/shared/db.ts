import mongoose from 'mongoose';
import { config } from './config';
import { mongoConnectionState, activeSessions, getDeploymentEnv } from './observability';
import { ChatSession } from './models/chatSession.model';

// 활성 세션 추적 인터벌 핸들
let activeSessionsInterval: ReturnType<typeof setInterval> | null = null;

// 여러 번 connectDB() 호출 시 중복 리스너 등록 방지
let listenersRegistered = false;

/** 활성 세션 추적 중지 (graceful shutdown용) */
export const stopActiveSessionsTracking = (): void => {
  if (activeSessionsInterval) {
    clearInterval(activeSessionsInterval);
    activeSessionsInterval = null;
  }
};

// MongoDB 연결
// Mongoose가 connection pooling을 자동으로 처리
// 참고: MONGO_URI 검증은 시작 시 validateEnv()에서 처리됨
export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected successfully');

    // MongoDB 연결 상태 metrics 설정 (리스너 누적 방지를 위해 한 번만)
    const deploymentEnv = getDeploymentEnv();

    if (!listenersRegistered) {
      mongoose.connection.on('connected', () => {
        mongoConnectionState.labels(deploymentEnv).set(1);
      });

      mongoose.connection.on('disconnected', () => {
        mongoConnectionState.labels(deploymentEnv).set(0);
      });

      mongoose.connection.on('connecting', () => {
        mongoConnectionState.labels(deploymentEnv).set(2);
      });

      mongoose.connection.on('disconnecting', () => {
        mongoConnectionState.labels(deploymentEnv).set(3);
      });

      listenersRegistered = true;
    }

    // 초기 상태 설정 (연결 시 항상 업데이트)
    mongoConnectionState.labels(deploymentEnv).set(mongoose.connection.readyState);

    // 주기적 활성 세션 추적 시작 (최근 5분 내 활동이 있는 세션)
    const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5분
    const UPDATE_INTERVAL_MS = 30 * 1000; // 30초마다 업데이트

    const updateActiveSessions = async () => {
      try {
        const cutoff = new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS);
        const count = await ChatSession.countDocuments({ updatedAt: { $gte: cutoff } });
        activeSessions.labels(deploymentEnv).set(count);
      } catch (err) {
        console.error('[Metrics] Failed to update active sessions:', err);
      }
    };

    // 초기 업데이트
    await updateActiveSessions();
    console.log('[Metrics] Active sessions tracking started (5-minute window, 30s interval)');

    // 새 인터벌 생성 전에 기존 인터벌 정리 (재연결 시 누적 방지)
    stopActiveSessionsTracking();

    // 주기적 업데이트 (shutdown 시 cleanup을 위해 핸들 저장)
    activeSessionsInterval = setInterval(updateActiveSessions, UPDATE_INTERVAL_MS);
    activeSessionsInterval.unref();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// 모델에서 사용하기 위해 mongoose export
export default mongoose;
