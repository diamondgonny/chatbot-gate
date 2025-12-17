import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JWTPayload {
  userId: string;
}

/**
 * JWT 토큰 생성
 * @param userId - UUID 사용자 식별자
 * @returns 서명된 JWT 토큰
 */
export const signToken = (userId: string): string => {
  const payload: JWTPayload = { userId };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
};

/**
 * JWT 토큰 검증 및 디코드
 * @param token - JWT 토큰 문자열
 * @returns userId를 포함한 페이로드
 * @throws 토큰이 유효하지 않거나 만료된 경우 에러
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw error;
  }
};
