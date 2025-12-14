import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Default mock data
export const mockAuthStatus = { authenticated: true, userId: "user-123" };

export const mockSessions = [
  {
    sessionId: "session-1",
    title: "Chat 1",
    lastMessage: null,
    updatedAt: "2024-01-02T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    sessionId: "session-2",
    title: "Chat 2",
    lastMessage: null,
    updatedAt: "2024-01-03T00:00:00Z",
    createdAt: "2024-01-02T00:00:00Z",
  },
];

export const mockMessages = [
  { role: "user", content: "Hello", timestamp: "2024-01-01T00:00:00Z" },
  { role: "ai", content: "Hi there!", timestamp: "2024-01-01T00:00:01Z" },
];

// Default handlers
export const handlers = [
  // Auth endpoints
  http.get("*/api/auth/status", () => {
    return HttpResponse.json(mockAuthStatus);
  }),

  http.post("*/api/gate/validate", async ({ request }) => {
    const body = (await request.json()) as { code: string; userId?: string };
    if (body.code === "valid-code") {
      return HttpResponse.json({ valid: true, userId: "user-123" });
    }
    return HttpResponse.json({ valid: false, userId: "" });
  }),

  // Session endpoints
  http.get("*/api/chat/sessions", () => {
    return HttpResponse.json({ sessions: mockSessions });
  }),

  http.post("*/api/chat/sessions", () => {
    return HttpResponse.json({
      sessionId: "new-session-id",
      title: "New Chat",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }),

  http.delete("*/api/chat/sessions/:sessionId", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Chat endpoints
  http.get("*/api/chat/history", ({ request }) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (sessionId) {
      return HttpResponse.json({ messages: mockMessages });
    }
    return HttpResponse.json({ messages: [] });
  }),

  http.post("*/api/chat/message", async ({ request }) => {
    const body = (await request.json()) as { message: string; sessionId: string };
    return HttpResponse.json({
      response: `Echo: ${body.message}`,
      timestamp: new Date().toISOString(),
      sessionId: body.sessionId,
    });
  }),
];

export const server = setupServer(...handlers);
