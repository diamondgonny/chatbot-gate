import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type {
  CouncilSession,
  CouncilMessage,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  ProcessingStatus,
} from "@/features/council/types";

// Default mock data
export const mockAuthStatus = { authenticated: true, userId: "user-123" };

// ============================================
// Council mock data
// ============================================
export const mockCouncilSessions: CouncilSession[] = [
  {
    sessionId: "council-session-1",
    title: "AI의 미래에 대해",
    updatedAt: "2024-01-03T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    sessionId: "council-session-2",
    title: "프로그래밍 언어 비교",
    updatedAt: "2024-01-04T00:00:00Z",
    createdAt: "2024-01-02T00:00:00Z",
  },
];

export const mockStage1Responses: Stage1Response[] = [
  {
    model: "gpt-4o",
    response: "AI는 다양한 분야에서 혁신을 이끌고 있습니다.",
    responseTimeMs: 1500,
    promptTokens: 100,
    completionTokens: 50,
  },
  {
    model: "claude-3-5-sonnet",
    response: "인공지능의 발전은 윤리적 고려와 함께 진행되어야 합니다.",
    responseTimeMs: 1200,
    promptTokens: 100,
    completionTokens: 45,
  },
  {
    model: "gemini-2.0-flash",
    response: "AI 기술은 인간의 능력을 보완하는 방향으로 발전해야 합니다.",
    responseTimeMs: 1100,
    promptTokens: 100,
    completionTokens: 48,
  },
];

export const mockStage2Reviews: Stage2Review[] = [
  {
    model: "gpt-4o",
    ranking: "B > C > A",
    parsedRanking: ["claude-3-5-sonnet", "gemini-2.0-flash", "gpt-4o"],
    responseTimeMs: 800,
  },
  {
    model: "claude-3-5-sonnet",
    ranking: "A > C > B",
    parsedRanking: ["gpt-4o", "gemini-2.0-flash", "claude-3-5-sonnet"],
    responseTimeMs: 750,
  },
];

export const mockStage3Synthesis: Stage3Synthesis = {
  model: "o3-mini",
  response:
    "AI의 미래는 기술적 혁신과 윤리적 책임이 조화를 이루는 방향으로 발전해야 합니다.",
  reasoning: "각 모델의 관점을 종합하여 균형 잡힌 결론을 도출했습니다.",
  responseTimeMs: 2000,
  promptTokens: 500,
  completionTokens: 100,
  reasoningTokens: 200,
};

export const mockCouncilMessages: CouncilMessage[] = [
  {
    role: "user",
    content: "AI의 미래에 대해 어떻게 생각하시나요?",
    timestamp: "2024-01-01T00:00:00Z",
  },
  {
    role: "assistant",
    stage1: mockStage1Responses,
    stage2: mockStage2Reviews,
    stage3: mockStage3Synthesis,
    timestamp: "2024-01-01T00:00:30Z",
  },
];

export const mockProcessingStatus: ProcessingStatus = {
  isProcessing: false,
  canReconnect: false,
};

// ============================================
// Chat mock data (legacy)
// ============================================
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

  http.get("*/api/chat/sessions/:sessionId", ({ params }) => {
    const { sessionId } = params;
    const session = mockSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      return HttpResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...session,
      messages: mockMessages,
    });
  }),

  http.delete("*/api/chat/sessions/:sessionId", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("*/api/chat/sessions/:sessionId/message", async ({ request, params }) => {
    const body = (await request.json()) as { message: string };
    const { sessionId } = params;
    return HttpResponse.json({
      response: `Echo: ${body.message}`,
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
    });
  }),

  // ============================================
  // Council API endpoints
  // ============================================

  // Get all council sessions
  http.get("*/api/council/sessions", () => {
    return HttpResponse.json({ sessions: mockCouncilSessions });
  }),

  // Create new council session
  http.post("*/api/council/sessions", () => {
    return HttpResponse.json({
      sessionId: "new-council-session-id",
      title: "New Council",
      createdAt: new Date().toISOString(),
    });
  }),

  // Get council session detail (with messages)
  http.get("*/api/council/sessions/:sessionId", ({ params }) => {
    const { sessionId } = params;
    const session = mockCouncilSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      return HttpResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...session,
      messages: mockCouncilMessages,
    });
  }),

  // Get council session processing status
  http.get("*/api/council/sessions/:sessionId/status", () => {
    return HttpResponse.json(mockProcessingStatus);
  }),

  // Delete council session
  http.delete("*/api/council/sessions/:sessionId", () => {
    return new HttpResponse(null, { status: 204 });
  }),
];

export const server = setupServer(...handlers);
