/**
 * Council Session Switch Integration Tests
 *
 * Scenarios:
 * 6. 다른 세션 전환 → 해당 세션 메시지 표시
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { server } from "../../setup/msw-handlers";
import { http, HttpResponse } from "msw";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ sessionId: "session-1" }),
  usePathname: () => "/council/session-1",
}));

// Import after mocking
import {
  CouncilProvider,
  CouncilSessionsProvider,
  CouncilMessagesProvider,
  CouncilStreamProvider,
  CouncilStatusProvider,
  useCouncilContext,
} from "@/features/council";
import { MessageList } from "@/features/council/ui";
import type { CouncilMessage } from "@/features/council/domain";

/**
 * Test wrapper with providers
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CouncilSessionsProvider>
      <CouncilMessagesProvider>
        <CouncilStreamProvider>
          <CouncilStatusProvider>
            <CouncilProvider>{children}</CouncilProvider>
          </CouncilStatusProvider>
        </CouncilStreamProvider>
      </CouncilMessagesProvider>
    </CouncilSessionsProvider>
  );
}

/**
 * Helper component to access context
 */
function StateInjector({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof useCouncilContext>) => void;
}) {
  const ctx = useCouncilContext();
  onContext(ctx);
  return null;
}

describe("Council Session Switch", () => {
  const session1Messages: CouncilMessage[] = [
    {
      role: "user",
      content: "세션 1의 첫 번째 질문입니다",
      timestamp: "2024-01-01T00:00:00Z",
    },
    {
      role: "assistant",
      stage1: [
        { model: "gpt-4o", response: "세션 1의 첫 번째 답변", responseTimeMs: 1000 },
      ],
      timestamp: "2024-01-01T00:00:10Z",
    },
  ];

  const session2Messages: CouncilMessage[] = [
    {
      role: "user",
      content: "세션 2의 다른 질문입니다",
      timestamp: "2024-01-02T00:00:00Z",
    },
    {
      role: "assistant",
      stage1: [
        { model: "claude-3", response: "세션 2의 다른 답변", responseTimeMs: 1200 },
      ],
      timestamp: "2024-01-02T00:00:15Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("시나리오 6: 세션 전환 시 해당 세션 메시지 표시", () => {
    it("첫 번째 세션 로드 시 해당 메시지가 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({
            sessions: [
              {
                sessionId: "session-1",
                title: "Session 1",
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-01T00:00:10Z",
              },
              {
                sessionId: "session-2",
                title: "Session 2",
                createdAt: "2024-01-02T00:00:00Z",
                updatedAt: "2024-01-02T00:00:15Z",
              },
            ],
          });
        }),
        http.get("*/api/council/sessions/session-1", () => {
          return HttpResponse.json({
            sessionId: "session-1",
            title: "Session 1",
            messages: session1Messages,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:10Z",
          });
        }),
        http.get("*/api/council/sessions/:sessionId/status", () => {
          return HttpResponse.json({
            isProcessing: false,
            canReconnect: false,
          });
        })
      );

      let contextRef: ReturnType<typeof useCouncilContext>;

      render(
        <TestWrapper>
          <StateInjector onContext={(ctx) => (contextRef = ctx)} />
          <MessageList />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(contextRef).toBeDefined();
      });

      await act(async () => {
        await contextRef.loadSession("session-1");
      });

      // 세션 1의 메시지가 표시됨
      await waitFor(() => {
        expect(
          screen.getByText("세션 1의 첫 번째 질문입니다")
        ).toBeInTheDocument();
      });

      // 세션 2의 메시지는 표시되지 않음
      expect(
        screen.queryByText("세션 2의 다른 질문입니다")
      ).not.toBeInTheDocument();
    });

    it("세션을 전환하면 새 세션의 메시지가 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({
            sessions: [
              {
                sessionId: "session-1",
                title: "Session 1",
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-01T00:00:10Z",
              },
              {
                sessionId: "session-2",
                title: "Session 2",
                createdAt: "2024-01-02T00:00:00Z",
                updatedAt: "2024-01-02T00:00:15Z",
              },
            ],
          });
        }),
        http.get("*/api/council/sessions/session-1", () => {
          return HttpResponse.json({
            sessionId: "session-1",
            title: "Session 1",
            messages: session1Messages,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:10Z",
          });
        }),
        http.get("*/api/council/sessions/session-2", () => {
          return HttpResponse.json({
            sessionId: "session-2",
            title: "Session 2",
            messages: session2Messages,
            createdAt: "2024-01-02T00:00:00Z",
            updatedAt: "2024-01-02T00:00:15Z",
          });
        }),
        http.get("*/api/council/sessions/:sessionId/status", () => {
          return HttpResponse.json({
            isProcessing: false,
            canReconnect: false,
          });
        })
      );

      let contextRef: ReturnType<typeof useCouncilContext>;

      render(
        <TestWrapper>
          <StateInjector onContext={(ctx) => (contextRef = ctx)} />
          <MessageList />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(contextRef).toBeDefined();
      });

      // 세션 1 로드
      await act(async () => {
        await contextRef.loadSession("session-1");
      });

      await waitFor(() => {
        expect(
          screen.getByText("세션 1의 첫 번째 질문입니다")
        ).toBeInTheDocument();
      });

      // 세션 2로 전환
      await act(async () => {
        await contextRef.loadSession("session-2");
      });

      // 세션 2의 메시지가 표시됨
      await waitFor(() => {
        expect(
          screen.getByText("세션 2의 다른 질문입니다")
        ).toBeInTheDocument();
      });

      // 세션 1의 메시지는 더 이상 표시되지 않음
      expect(
        screen.queryByText("세션 1의 첫 번째 질문입니다")
      ).not.toBeInTheDocument();
    });

    it("세션 전환 시 이전 세션 상태가 초기화된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        }),
        http.get("*/api/council/sessions/session-1", () => {
          return HttpResponse.json({
            sessionId: "session-1",
            title: "Session 1",
            messages: session1Messages,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:10Z",
          });
        }),
        http.get("*/api/council/sessions/session-2", () => {
          return HttpResponse.json({
            sessionId: "session-2",
            title: "Session 2",
            messages: [], // 빈 세션
            createdAt: "2024-01-02T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
          });
        }),
        http.get("*/api/council/sessions/:sessionId/status", () => {
          return HttpResponse.json({
            isProcessing: false,
            canReconnect: false,
          });
        })
      );

      let contextRef: ReturnType<typeof useCouncilContext>;

      render(
        <TestWrapper>
          <StateInjector onContext={(ctx) => (contextRef = ctx)} />
          <MessageList />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(contextRef).toBeDefined();
      });

      // 세션 1 로드 (메시지 있음)
      await act(async () => {
        await contextRef.loadSession("session-1");
      });

      await waitFor(() => {
        expect(contextRef.messages).toHaveLength(2);
      });

      // 세션 2로 전환 (빈 세션)
      await act(async () => {
        await contextRef.loadSession("session-2");
      });

      // 메시지가 초기화됨
      await waitFor(() => {
        expect(contextRef.messages).toHaveLength(0);
      });

      // 빈 상태 메시지 표시
      expect(screen.getByText("Start by asking a question.")).toBeInTheDocument();
    });
  });
});
