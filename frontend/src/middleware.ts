import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PATHS = ["/hub", "/chat"];

/**
 * Verify JWT token signature and expiration
 */
async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return false;
  }

  try {
    // Convert secret string to Uint8Array for jose
    const secretKey = new TextEncoder().encode(secret);

    // Verify token signature and expiration
    await jwtVerify(token, secretKey);
    return true;
  } catch (error) {
    // Token is invalid (expired, malformed, or wrong signature)
    console.error("JWT verification failed:", error);
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is protected
  const isProtectedPath = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  // Check for JWT cookie
  const token = request.cookies.get("jwt");

  if (!token?.value) {
    // Redirect to gate page if no token
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Verify JWT signature and expiration
  const isValid = await verifyToken(token.value);

  if (!isValid) {
    // Token is invalid or expired - clear cookie and redirect
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const response = NextResponse.redirect(url);

    // Clear the invalid JWT cookie
    response.cookies.delete("jwt");

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/hub/:path*", "/chat/:path*"],
};
