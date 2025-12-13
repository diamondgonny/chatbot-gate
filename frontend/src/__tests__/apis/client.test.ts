import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup/msw-handlers";
import * as navigationModule from "@/apis/navigation";
import apiClient from "@/apis/client";

describe("apiClient", () => {
  describe("configuration", () => {
    it("should have withCredentials set to true", () => {
      expect(apiClient.defaults.withCredentials).toBe(true);
    });

    it("should have baseURL set", () => {
      expect(apiClient.defaults.baseURL).toBeDefined();
    });
  });

  describe("request interceptor - CSRF token injection", () => {
    it("should inject x-csrf-token header when csrfToken cookie exists", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.get("*/api/test", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ ok: true });
        })
      );

      document.cookie = "csrfToken=test-token-123";
      await apiClient.get("/api/test");

      expect(capturedHeaders["x-csrf-token"]).toBe("test-token-123");
    });

    it("should decode URI-encoded CSRF token correctly", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.get("*/api/test", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ ok: true });
        })
      );

      document.cookie = "csrfToken=test%20token%2B123";
      await apiClient.get("/api/test");

      expect(capturedHeaders["x-csrf-token"]).toBe("test token+123");
    });

    it("should not add header when csrfToken cookie is missing", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.get("*/api/test", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ ok: true });
        })
      );

      document.cookie = "";
      await apiClient.get("/api/test");

      expect(capturedHeaders["x-csrf-token"]).toBeUndefined();
    });
  });

  describe("response interceptor - auth error handling", () => {
    let goToGateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      goToGateSpy = vi
        .spyOn(navigationModule.navigation, "goToGate")
        .mockImplementation(() => {});
    });

    afterEach(() => {
      goToGateSpy.mockRestore();
    });

    it("should navigate to gate on 401 response", async () => {
      server.use(
        http.get("*/api/unauthorized", () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      // The promise never resolves due to the interceptor returning new Promise(() => {})
      apiClient.get("/api/unauthorized");

      // Wait a bit for the interceptor to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(goToGateSpy).toHaveBeenCalled();
    });

    it("should navigate to gate on 403 response", async () => {
      server.use(
        http.get("*/api/forbidden", () => {
          return new HttpResponse(null, { status: 403 });
        })
      );

      apiClient.get("/api/forbidden");

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(goToGateSpy).toHaveBeenCalled();
    });

    it("should propagate 429 rate limit errors", async () => {
      server.use(
        http.get("*/api/rate-limited", () => {
          return HttpResponse.json(
            { error: "Too many requests", limit: 10, count: 10 },
            { status: 429 }
          );
        })
      );

      await expect(apiClient.get("/api/rate-limited")).rejects.toMatchObject({
        response: { status: 429 },
      });
    });

    it("should propagate 500 server errors", async () => {
      server.use(
        http.get("*/api/server-error", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(apiClient.get("/api/server-error")).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });
});
