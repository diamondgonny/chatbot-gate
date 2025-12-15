/**
 * Council Page Integration Tests
 *
 * Scenarios:
 * 1. /council 접속 → 빈 상태 표시
 * 2. 새 세션 생성 → 입력창 표시
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "../../setup/msw-handlers";
import { http, HttpResponse } from "msw";

// Mock next/navigation
const mockPush = vi.fn();
const mockParams = vi.fn(() => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => mockParams(),
  usePathname: () => "/council",
}));

// Import components after mocking
import {
  CouncilProvider,
  CouncilSessionsProvider,
  CouncilMessagesProvider,
  CouncilStreamProvider,
  CouncilStatusProvider,
} from "@/features/council";
import { MessageList, InputArea } from "@/features/council/ui";

/**
 * Test wrapper with all necessary providers
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

describe("Council Page - Empty State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.mockReturnValue({});
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("시나리오 1: /council 접속 → 빈 상태 표시", () => {
    it("빈 세션일 때 EmptyState를 표시한다", async () => {
      // Setup: 빈 세션 목록 반환
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <MessageList />
        </TestWrapper>
      );

      // Verify: EmptyState 표시 (새 페이지/빈 페이지)
      await waitFor(() => {
        expect(
          screen.getByText("Start by asking a question.")
        ).toBeInTheDocument();
      });
    });

    it("세션이 없을 때 입력창을 표시한다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <InputArea sessionId="test-session" />
        </TestWrapper>
      );

      // Verify: 입력창이 표시됨
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/Ask the council a question/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("시나리오 2: 새 세션 생성 → 입력창 표시", () => {
    it("새 세션 생성 후 입력창이 활성화된다", async () => {
      const user = userEvent.setup();

      // Setup: 빈 세션 목록과 새 세션 생성 응답
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        }),
        http.post("*/api/council/sessions", () => {
          return HttpResponse.json({
            sessionId: "new-session-123",
            title: "New Council",
            createdAt: new Date().toISOString(),
          });
        })
      );

      render(
        <TestWrapper>
          <InputArea sessionId="new-session-123" />
        </TestWrapper>
      );

      // Verify: 입력창이 표시되고 활성화됨
      const textarea = await screen.findByPlaceholderText(
        /Ask the council a question/
      );
      expect(textarea).toBeInTheDocument();
      expect(textarea).not.toBeDisabled();

      // 텍스트 입력 가능
      await user.type(textarea, "Hello Council");
      expect(textarea).toHaveValue("Hello Council");
    });

    it("전송 버튼이 텍스트 입력 시에만 활성화된다", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <InputArea sessionId="test-session" />
        </TestWrapper>
      );

      const textarea = await screen.findByPlaceholderText(
        /Ask the council a question/
      );
      const submitButton = screen.getByRole("button", { name: "" }); // Send icon button

      // 초기: 비활성화
      expect(submitButton).toBeDisabled();

      // 텍스트 입력 후: 활성화
      await user.type(textarea, "Test message");
      expect(submitButton).not.toBeDisabled();

      // 텍스트 삭제 후: 다시 비활성화
      await user.clear(textarea);
      expect(submitButton).toBeDisabled();
    });

    it("Mode toggle이 기본값 Ultra로 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <InputArea sessionId="test-session" />
        </TestWrapper>
      );

      // Ultra 버튼이 활성화된 스타일로 표시됨
      await waitFor(() => {
        const ultraButton = screen.getByRole("button", { name: "Ultra" });
        expect(ultraButton).toHaveClass("bg-purple-600");
      });
    });
  });
});
