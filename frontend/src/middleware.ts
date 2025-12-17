import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PATHS = ["/hub", "/chat", "/council"];

/**
 * JWT token signature와 만료 검증
 */
async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return false;
  }

  try {
    // jose를 위해 secret 문자열을 Uint8Array로 변환
    const secretKey = new TextEncoder().encode(secret);

    // Token signature와 만료 검증
    await jwtVerify(token, secretKey);
    return true;
  } catch (error) {
    // Token이 invalid함 (만료됨, 잘못된 형식, 또는 잘못된 signature)
    console.error("JWT verification failed:", error);
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Path가 protected인지 확인
  const isProtectedPath = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  // JWT cookie 확인
  const token = request.cookies.get("jwt");

  if (!token?.value) {
    // Token이 없으면 gate page로 redirect
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // JWT signature와 만료 검증
  const isValid = await verifyToken(token.value);

  if (!isValid) {
    // Token이 invalid하거나 만료됨 - cookie 삭제하고 redirect
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const response = NextResponse.redirect(url);

    // Invalid JWT cookie 삭제
    response.cookies.delete("jwt");

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/hub/:path*", "/chat/:path*", "/council/:path*"],
};
