/**
 * 애플리케이션 진입점
 * 서버 시작, 환경 로딩, graceful shutdown
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createApp } from './app';
import { validateEnv, connectDB, stopActiveSessionsTracking, logCookieConfig } from '@shared';
import { stopMetricsCollection } from './features/metrics';
import { processingRegistry } from './features/council';

// 필수 환경 변수 검증
validateEnv();

const PORT = process.env.PORT || 4000;

// 프로덕션 설정으로 Express 애플리케이션 생성
const app = createApp();

// 설정 로깅 (프로덕션 시작 정보)
logCookieConfig();

// 파일 기반 요청 로깅 설정 (프로덕션만)
const logDirectory = path.join(process.cwd(), 'logs');
if (!existsSync(logDirectory)) {
  mkdirSync(logDirectory, { recursive: true });
}
const accessLogStream = createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('combined'));

// 서버 시작
const startServer = async () => {
  try {
    // 요청을 받기 전에 MongoDB 연결
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    // Graceful shutdown 핸들러
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[${signal}] Shutting down gracefully...`);

      // 1. 새 연결 중지 및 기존 요청 완료 대기
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) console.error('Error closing HTTP server:', err);
          else console.log('HTTP server closed');
          resolve(); // 에러가 있어도 shutdown 계속
        });
      });

      // 2. SSE 클라이언트 정리 및 진행 중인 처리 abort
      processingRegistry.shutdown();
      console.log('SSE registry shut down');

      // 3. metrics 수집 타이머 중지
      stopMetricsCollection();
      console.log('Metrics collection stopped');

      // 4. 활성 세션 추적 중지
      stopActiveSessionsTracking();
      console.log('Active sessions tracking stopped');

      // 5. MongoDB 연결 종료
      try {
        await mongoose.connection.close(false);
        console.log('MongoDB connection closed');
      } catch (err) {
        console.error('Error closing MongoDB:', err);
      }

      // 6. 로그 스트림 닫기 및 종료
      accessLogStream.end(() => {
        console.log('Access log stream closed');
        process.exit(0);
      });

      // 타임아웃 폴백 (10초)
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
