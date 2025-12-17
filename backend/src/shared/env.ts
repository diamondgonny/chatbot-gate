/**
 * 환경 변수 검증
 * 필수 환경 변수에 대한 중앙화된 검증
 */

export interface RequiredEnv {
  JWT_SECRET: string;
  MONGO_URI: string;
}

/**
 * 시작 시 필수 환경 변수 검증
 * 누락된 변수가 있으면 프로세스 종료
 *
 * @returns 검증된 환경 변수
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
