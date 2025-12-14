import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server, mockSessions } from "../setup/msw-handlers";
import { getSessions, createSession, deleteSession } from "@/features/chat";

describe("session.api", () => {
  describe("getSessions", () => {
    it("should return sessions array", async () => {
      const result = await getSessions();

      expect(result.sessions).toEqual(mockSessions);
      expect(result.sessions).toHaveLength(2);
    });

    it("should return empty array when no sessions", async () => {
      server.use(
        http.get("*/api/chat/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      const result = await getSessions();

      expect(result.sessions).toEqual([]);
    });
  });

  describe("createSession", () => {
    it("should return new session with required fields", async () => {
      const result = await createSession();

      expect(result).toMatchObject({
        sessionId: expect.any(String),
        title: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("should throw error on 429 rate limit response", async () => {
      server.use(
        http.post("*/api/chat/sessions", () => {
          return HttpResponse.json(
            { error: "Too many sessions", limit: 5, count: 5 },
            { status: 429 }
          );
        })
      );

      await expect(createSession()).rejects.toMatchObject({
        response: {
          status: 429,
          data: {
            error: "Too many sessions",
            limit: 5,
            count: 5,
          },
        },
      });
    });
  });

  describe("deleteSession", () => {
    it("should complete without error for valid sessionId", async () => {
      await expect(deleteSession("session-1")).resolves.toBeUndefined();
    });

    it("should call correct endpoint with sessionId param", async () => {
      let capturedSessionId: string | undefined;

      server.use(
        http.delete("*/api/chat/sessions/:sessionId", ({ params }) => {
          capturedSessionId = params.sessionId as string;
          return new HttpResponse(null, { status: 204 });
        })
      );

      await deleteSession("my-session-id");

      expect(capturedSessionId).toBe("my-session-id");
    });

    it("should throw error on 404", async () => {
      server.use(
        http.delete("*/api/chat/sessions/:sessionId", () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      await expect(deleteSession("nonexistent")).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });
});
