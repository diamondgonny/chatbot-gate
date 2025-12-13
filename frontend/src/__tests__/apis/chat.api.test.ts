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
        http.get("*/api/chat/history", () => {
          return HttpResponse.json({ messages: [] });
        })
      );

      const result = await getChatHistory("empty-session");

      expect(result.messages).toEqual([]);
    });

    it("should pass sessionId as query parameter", async () => {
      let capturedSessionId: string | null = null;

      server.use(
        http.get("*/api/chat/history", ({ request }) => {
          const url = new URL(request.url);
          capturedSessionId = url.searchParams.get("sessionId");
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

    it("should send message and sessionId in request body", async () => {
      let capturedBody: { message: string; sessionId: string } | null = null;

      server.use(
        http.post("*/api/chat/message", async ({ request }) => {
          capturedBody = (await request.json()) as { message: string; sessionId: string };
          return HttpResponse.json({
            response: "AI response",
            timestamp: new Date().toISOString(),
            sessionId: capturedBody.sessionId,
          });
        })
      );

      await sendChatMessage({
        message: "Test message",
        sessionId: "test-session",
      });

      expect(capturedBody).toEqual({
        message: "Test message",
        sessionId: "test-session",
      });
    });

    it("should throw error on server failure", async () => {
      server.use(
        http.post("*/api/chat/message", () => {
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
