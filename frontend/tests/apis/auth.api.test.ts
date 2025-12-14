import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup/msw-handlers";
import { checkAuthStatus, validateGateCode } from "@/shared";

describe("auth.api", () => {
  describe("checkAuthStatus", () => {
    it("should return authenticated status with userId", async () => {
      const result = await checkAuthStatus();

      expect(result).toEqual({
        authenticated: true,
        userId: "user-123",
      });
    });

    it("should return unauthenticated status", async () => {
      server.use(
        http.get("*/api/auth/status", () => {
          return HttpResponse.json({ authenticated: false });
        })
      );

      const result = await checkAuthStatus();

      expect(result).toEqual({ authenticated: false });
    });
  });

  describe("validateGateCode", () => {
    it("should return valid response for correct code", async () => {
      const result = await validateGateCode({ code: "valid-code" });

      expect(result).toEqual({
        valid: true,
        userId: "user-123",
      });
    });

    it("should return invalid response for incorrect code", async () => {
      const result = await validateGateCode({ code: "wrong-code" });

      expect(result).toEqual({
        valid: false,
        userId: "",
      });
    });

    it("should pass userId if provided", async () => {
      let capturedBody: { code: string; userId?: string } | null = null;

      server.use(
        http.post("*/api/gate/validate", async ({ request }) => {
          capturedBody = (await request.json()) as { code: string; userId?: string };
          return HttpResponse.json({ valid: true, userId: capturedBody.userId || "user-123" });
        })
      );

      await validateGateCode({ code: "valid-code", userId: "existing-user-456" });

      expect(capturedBody).toEqual({
        code: "valid-code",
        userId: "existing-user-456",
      });
    });
  });
});
