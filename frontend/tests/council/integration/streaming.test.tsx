/**
 * Council Streaming Integration Tests
 *
 * Scenarios:
 * 4. 스트리밍 중 → Stage 패널 실시간 업데이트
 * 7. Abort 클릭 → 스트리밍 중단, partial results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "../../setup/msw-handlers";
import { http, HttpResponse } from "msw";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ sessionId: "test-session-123" }),
  usePathname: () => "/council/test-session-123",
}));

// Import after mocking
import {
  CouncilProvider,
  CouncilSessionsProvider,
  CouncilMessagesProvider,
  CouncilStreamProvider,
  CouncilStatusProvider,
  useCouncilStreamContext,
  useCouncilStatusContext,
} from "@/features/council";
import { StreamingMessage, InputArea } from "@/features/council/components";
import type { CurrentStage, Stage1Response } from "@/features/council/types";

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
 * Helper component to inject stream state for testing
 * Uses useLayoutEffect to ensure state is set before first paint
 */
function StreamStateInjector({
  currentStage,
  stage1Content,
  stage1Responses,
  stage2Content,
  stage3Content,
  isProcessing,
  wasAborted,
}: {
  currentStage?: CurrentStage;
  stage1Content?: Record<string, string>;
  stage1Responses?: Stage1Response[];
  stage2Content?: Record<string, string>;
  stage3Content?: string;
  isProcessing?: boolean;
  wasAborted?: boolean;
}) {
  const streamContext = useCouncilStreamContext();
  const statusContext = useCouncilStatusContext();

  // Track if already initialized to prevent re-runs
  const initialized = React.useRef(false);

  // Use useLayoutEffect to inject state synchronously before paint
  React.useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (isProcessing !== undefined) {
      statusContext.setProcessing(isProcessing);
    }
    if (wasAborted !== undefined) {
      statusContext.setAborted(wasAborted);
    }
    if (currentStage) {
      streamContext.updateStreamState({ currentStage });
    }
    if (stage1Responses && stage1Responses.length > 0) {
      streamContext.updateStreamState({ stage1Responses });
    }
    if (stage1Content) {
      streamContext.updateStreamState({ stage1StreamingContent: stage1Content });
    }
    if (stage2Content) {
      streamContext.updateStreamState({ stage2StreamingContent: stage2Content });
    }
    if (stage3Content) {
      streamContext.updateStreamState({ stage3StreamingContent: stage3Content });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Need React for useLayoutEffect
import React from "react";

describe("Council Streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("시나리오 4: 스트리밍 중 Stage 패널 실시간 업데이트", () => {
    it("Stage 1 스트리밍 중 패널이 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage1"
            stage1Content={{
              A: "AI는 인류의 미래를 변화시킬 것입니다...",
              B: "기술 발전은 양날의 검입니다...",
            }}
            isProcessing={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Stage 1 패널 헤더가 표시됨
      await waitFor(() => {
        expect(
          screen.getByText("Stage 1: Individual Responses")
        ).toBeInTheDocument();
      });

      // 스트리밍 중인 탭이 표시됨 (최소 1개 이상)
      const tabs = screen.getAllByRole("button");
      expect(tabs.length).toBeGreaterThanOrEqual(1);
    });

    it("Stage 1 완료된 응답이 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      const completedResponses: Stage1Response[] = [
        {
          model: "gpt-4o",
          response: "GPT-4o의 완성된 답변입니다.",
          responseTimeMs: 1500,
        },
        {
          model: "claude-3",
          response: "Claude의 완성된 답변입니다.",
          responseTimeMs: 1200,
        },
      ];

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage2"
            stage1Responses={completedResponses}
            isProcessing={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Stage 1 패널 헤더가 표시됨
      await waitFor(() => {
        expect(
          screen.getByText("Stage 1: Individual Responses")
        ).toBeInTheDocument();
      });

      // 모델 탭이 표시됨
      expect(screen.getByRole("button", { name: /Gpt 4o/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Claude 3/i })).toBeInTheDocument();
    });

    it("Stage 2 진행 중일 때 progress indicator에 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage2"
            stage1Responses={[
              { model: "gpt-4o", response: "답변 1", responseTimeMs: 1000 },
            ]}
            isProcessing={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Stage 2가 활성화됨을 progress indicator에서 확인
      await waitFor(() => {
        // "Peer Reviews" 텍스트가 blue (활성) 상태로 표시됨
        expect(screen.getByText("Peer Reviews")).toBeInTheDocument();
      });

      // Stage 1 패널도 표시됨 (완료된 응답)
      expect(
        screen.getByText("Stage 1: Individual Responses")
      ).toBeInTheDocument();
    });

    it("Stage 3 스트리밍 중 패널이 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage3"
            stage1Responses={[
              { model: "gpt-4o", response: "답변 1", responseTimeMs: 1000 },
            ]}
            stage3Content="최종 합성된 답변"
            isProcessing={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Stage 3 패널 헤더가 표시됨 (실제 텍스트: "Stage 3: Council's Final Answer")
      await waitFor(() => {
        expect(
          screen.getByText(/Stage 3.*Final/i)
        ).toBeInTheDocument();
      });
    });

    it("StageProgress가 현재 단계를 표시한다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage2"
            stage1Responses={[
              { model: "gpt-4o", response: "답변", responseTimeMs: 1000 },
              { model: "claude-3", response: "답변", responseTimeMs: 1000 },
            ]}
            isProcessing={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Stage progress indicator shows stage labels
      await waitFor(() => {
        expect(screen.getByText("Individual Responses")).toBeInTheDocument();
        expect(screen.getByText("Peer Reviews")).toBeInTheDocument();
        expect(screen.getByText("Final Synthesis")).toBeInTheDocument();
      });
    });
  });

  describe("시나리오 7: Abort 클릭 → 스트리밍 중단, partial results", () => {
    it("처리 중일 때 Stop Generation 버튼이 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        }),
        http.get("*/api/council/sessions/:sessionId", () => {
          return HttpResponse.json({
            sessionId: "test-session-123",
            title: "Test",
            messages: [
              {
                role: "user",
                content: "Test",
                timestamp: new Date().toISOString(),
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector isProcessing={true} />
          <InputArea sessionId="test-session-123" />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText("Stop Generation")).toBeInTheDocument();
      });
    });

    it("Abort 후 AbortedIndicator가 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage2"
            stage1Responses={[
              {
                model: "gpt-4o",
                response: "GPT-4o의 부분 답변",
                responseTimeMs: 1000,
              },
            ]}
            isProcessing={false}
            wasAborted={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Aborted indicator 표시
      await waitFor(() => {
        expect(
          screen.getByText(/Generation stopped - partial results shown below/)
        ).toBeInTheDocument();
      });

      // Stage 1 패널도 함께 표시됨 (partial results)
      expect(
        screen.getByText("Stage 1: Individual Responses")
      ).toBeInTheDocument();
    });

    it("Abort 후 Stage 1 패널에 부분 결과가 표시된다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector
            currentStage="stage1"
            stage1Content={{
              A: "모델 A의 부분 응답...",
            }}
            isProcessing={false}
            wasAborted={true}
          />
          <StreamingMessage />
        </TestWrapper>
      );

      // Aborted indicator 표시
      await waitFor(() => {
        expect(
          screen.getByText(/Generation stopped - partial results shown below/)
        ).toBeInTheDocument();
      });

      // Stage 1 패널 표시
      expect(
        screen.getByText("Stage 1: Individual Responses")
      ).toBeInTheDocument();

      // 부분 응답 탭이 표시됨
      const tabs = screen.getAllByRole("button");
      expect(tabs.length).toBeGreaterThanOrEqual(1);
    });

    it("Abort 후 isProcessing이 false이면 Stop 버튼이 사라진다", async () => {
      server.use(
        http.get("*/api/council/sessions", () => {
          return HttpResponse.json({ sessions: [] });
        }),
        http.get("*/api/council/sessions/:sessionId", () => {
          return HttpResponse.json({
            sessionId: "test-session-123",
            title: "Test",
            messages: [
              {
                role: "user",
                content: "Test",
                timestamp: new Date().toISOString(),
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      render(
        <TestWrapper>
          <StreamStateInjector isProcessing={false} wasAborted={true} />
          <InputArea sessionId="test-session-123" />
        </TestWrapper>
      );

      // Stop 버튼이 없어야 함 (isProcessing=false)
      await waitFor(() => {
        expect(screen.queryByText("Stop Generation")).not.toBeInTheDocument();
      });
    });
  });
});
