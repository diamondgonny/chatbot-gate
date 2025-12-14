import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server, mockMessages } from "../setup/msw-handlers";
import { getChatHistory, sendChatMessage } from "@/features/chat";

describe("chat.api", () => {
  describe("getChatHistory", () => {
    it("should return messages array for valid sessionId", async () => {
      const result = await getChatHistory("session-1");

      expect(result.messages).toEqual(mockMessages);
      expect(result.messages).toHaveLength(2);
    });

    it("should return empty array for session with no messages", async () => {
      server.use(
        http.get("*/api/chat/sessions/:sessionId/history", () => {
          return HttpResponse.json({ messages: [] });
        })
      );

      const result = await getChatHistory("empty-session");

      expect(result.messages).toEqual([]);
    });

    it("should pass sessionId as URL path parameter", async () => {
      let capturedSessionId: string | readonly string[] | undefined;

      server.use(
        http.get("*/api/chat/sessions/:sessionId/history", ({ params }) => {
          capturedSessionId = params.sessionId;
          return HttpResponse.json({ messages: [] });
        })
      );

      await getChatHistory("my-session-id");

      expect(capturedSessionId).toBe("my-session-id");
    });
  });

  describe("sendChatMessage", () => {
    it("should return AI response with timestamp and sessionId", async () => {
      const result = await sendChatMessage({
        message: "Hello",
        sessionId: "session-1",
      });

      expect(result).toMatchObject({
        response: "Echo: Hello",
        sessionId: "session-1",
        timestamp: expect.any(String),
      });
    });

    it("should send message in request body and sessionId in URL", async () => {
      let capturedBody: { message: string } | null = null;
      let capturedSessionId: string | readonly string[] | undefined;

      server.use(
        http.post("*/api/chat/sessions/:sessionId/message", async ({ request, params }) => {
          capturedBody = (await request.json()) as { message: string };
          capturedSessionId = params.sessionId;
          return HttpResponse.json({
            response: "AI response",
            timestamp: new Date().toISOString(),
            sessionId: capturedSessionId,
          });
        })
      );

      await sendChatMessage({
        message: "Test message",
        sessionId: "test-session",
      });

      expect(capturedBody).toEqual({ message: "Test message" });
      expect(capturedSessionId).toBe("test-session");
    });

    it("should throw error on server failure", async () => {
      server.use(
        http.post("*/api/chat/sessions/:sessionId/message", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(
        sendChatMessage({ message: "Hello", sessionId: "session-1" })
      ).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });
});
