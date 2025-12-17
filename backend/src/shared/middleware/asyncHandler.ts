/**
 * Async Handler 미들웨어
 * 비동기 라우트 핸들러를 래핑하여 에러를 자동으로 캐치하고 에러 미들웨어로 전달
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * 비동기 라우트 핸들러를 래핑하여 에러를 캐치하고 Express 에러 미들웨어로 전달
 * 모든 컨트롤러에 try/catch 블록을 작성할 필요 제거
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await userService.findAll();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
