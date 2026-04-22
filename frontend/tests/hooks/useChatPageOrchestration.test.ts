import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatPageOrchestration } from "@/features/chat";
import type { Session } from "@/features/chat";

type SessionServices = {
  getSessions: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
};

type ChatServices = {
  getChatHistory: ReturnType<typeof vi.fn>;
  sendChatMessage: ReturnType<typeof vi.fn>;
};

type MockBundle = {
  sessionServices: SessionServices;
  chatServices: ChatServices;
};

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  sessionId: "session-existing",
  title: "Existing",
  lastMessage: null,
  updatedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

const makeMocks = (init: {
  sessions?: Session[];
  historyMessages?: Array<{ role: string; content: string; timestamp: string }>;
  newSessionResponse?: {
    sessionId: string;
    title: string;
    updatedAt: string;
    createdAt: string;
  };
} = {}): MockBundle => {
  const sessions = init.sessions ?? [];
  const historyMessages = init.historyMessages ?? [];
  const newSessionResponse = init.newSessionResponse ?? {
    sessionId: "session-new",
    title: "New Chat",
    updatedAt: "2024-02-01T00:00:00Z",
    createdAt: "2024-02-01T00:00:00Z",
  };

  return {
    sessionServices: {
      getSessions: vi.fn().mockResolvedValue({ sessions }),
      createSession: vi.fn().mockResolvedValue(newSessionResponse),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    },
    chatServices: {
      getChatHistory: vi.fn().mockResolvedValue({ messages: historyMessages }),
      sendChatMessage: vi.fn().mockResolvedValue({
        response: "AI response",
        timestamp: "2024-02-01T00:00:05Z",
      }),
    },
  };
};

const renderOrchestration = (mocks: MockBundle) =>
  renderHook(() =>
    useChatPageOrchestration({
      sessionServices: mocks.sessionServices,
      chatServices: mocks.chatServices,
    })
  );

const makeFormEvent = () =>
  ({ preventDefault: vi.fn() } as unknown as React.FormEvent);

describe("useChatPageOrchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mount", () => {
    it("should clear currentSessionId and messages when there are no sessions", async () => {
      const mocks = makeMocks({ sessions: [] });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.sessions).toEqual([]);
      expect(mocks.chatServices.getChatHistory).not.toHaveBeenCalled();
    });

    it("should select the latest session when sessions exist", async () => {
      const sessions = [
        makeSession({ sessionId: "s1", updatedAt: "2024-01-01T00:00:00Z" }),
        makeSession({ sessionId: "s2", updatedAt: "2024-01-05T00:00:00Z" }),
      ];
      const mocks = makeMocks({
        sessions,
        historyMessages: [
          { role: "user", content: "hi", timestamp: "2024-01-05T00:00:00Z" },
        ],
      });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentSessionId).toBe("s2");
      expect(mocks.chatServices.getChatHistory).toHaveBeenCalledWith("s2");
      expect(result.current.messages).toHaveLength(1);
    });
  });

  describe("handleSendMessage — no auto-create", () => {
    it("should be a no-op when currentSessionId is null", async () => {
      const mocks = makeMocks({ sessions: [] });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setInput("hello");
      });

      await act(async () => {
        await result.current.handleSendMessage(makeFormEvent());
      });

      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
      expect(mocks.chatServices.sendChatMessage).not.toHaveBeenCalled();
      expect(result.current.messages).toEqual([]);
      expect(result.current.input).toBe("hello");
      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.sessions).toEqual([]);
    });

    it("should not trigger a send on empty input", async () => {
      const mocks = makeMocks({
        sessions: [makeSession({ sessionId: "s1" })],
      });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.handleSendMessage(makeFormEvent());
      });

      expect(mocks.chatServices.sendChatMessage).not.toHaveBeenCalled();
    });

    it("should send normally when a session is already selected", async () => {
      const mocks = makeMocks({
        sessions: [makeSession({ sessionId: "s1" })],
      });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setInput("hi");
      });
      await act(async () => {
        await result.current.handleSendMessage(makeFormEvent());
      });

      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
      expect(mocks.chatServices.sendChatMessage).toHaveBeenCalledWith({
        message: "hi",
        sessionId: "s1",
      });
      expect(result.current.messages.map((m) => m.role)).toEqual(["user", "ai"]);
      expect(result.current.input).toBe("");
    });
  });

  describe("handleNewChat — prepend without refetch", () => {
    it("should prepend the new session and NOT refetch getSessions", async () => {
      const mocks = makeMocks({
        sessions: [
          makeSession({ sessionId: "s1", updatedAt: "2024-01-01T00:00:00Z" }),
        ],
        newSessionResponse: {
          sessionId: "s-new",
          title: "New Chat",
          updatedAt: "2024-02-01T00:00:00Z",
          createdAt: "2024-02-01T00:00:00Z",
        },
      });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mocks.sessionServices.getSessions).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.handleNewChat();
      });

      // mount 이후 refetch 없이 단일 prepend만 발생
      expect(mocks.sessionServices.getSessions).toHaveBeenCalledTimes(1);
      expect(mocks.sessionServices.createSession).toHaveBeenCalledTimes(1);
      expect(result.current.sessions.map((s) => s.sessionId)).toEqual([
        "s-new",
        "s1",
      ]);
      expect(result.current.currentSessionId).toBe("s-new");
      expect(result.current.messages).toEqual([]);
    });

    it("should not duplicate list entries on single call (no prev + getSessions race)", async () => {
      const mocks = makeMocks({ sessions: [] });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.handleNewChat();
      });

      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].sessionId).toBe("session-new");
    });
  });

  describe("delete session — empty-state transition, no auto-create", () => {
    it("should clear currentSessionId/messages and NOT call createSession when deleting the only session", async () => {
      const only = makeSession({ sessionId: "s-only" });
      const mocks = makeMocks({
        sessions: [only],
        historyMessages: [
          { role: "user", content: "hi", timestamp: "2024-01-01T00:00:00Z" },
        ],
      });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.currentSessionId).toBe("s-only");
      expect(result.current.messages).toHaveLength(1);

      act(() => {
        result.current.requestDeleteSession("s-only");
      });
      await act(async () => {
        await result.current.confirmDeleteSession();
      });

      expect(mocks.sessionServices.deleteSession).toHaveBeenCalledWith("s-only");
      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
      // mount 1회 이후 추가 호출 없음
      expect(mocks.sessionServices.getSessions).toHaveBeenCalledTimes(1);
      expect(result.current.sessions).toEqual([]);
      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.sessionToDelete).toBeNull();
    });

    it("should select the next remaining session when deleting the current one among several", async () => {
      const sessions = [
        makeSession({ sessionId: "s1", updatedAt: "2024-01-01T00:00:00Z" }),
        makeSession({ sessionId: "s2", updatedAt: "2024-01-05T00:00:00Z" }),
      ];
      const mocks = makeMocks({ sessions });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.currentSessionId).toBe("s2");

      act(() => {
        result.current.requestDeleteSession("s2");
      });
      await act(async () => {
        await result.current.confirmDeleteSession();
      });

      await waitFor(() => {
        expect(result.current.currentSessionId).toBe("s1");
      });
      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
      expect(result.current.sessions.map((s) => s.sessionId)).toEqual(["s1"]);
    });

    it("should not touch currentSessionId when deleting a non-current session", async () => {
      const sessions = [
        makeSession({ sessionId: "s1", updatedAt: "2024-01-01T00:00:00Z" }),
        makeSession({ sessionId: "s2", updatedAt: "2024-01-05T00:00:00Z" }),
      ];
      const mocks = makeMocks({ sessions });
      const { result } = renderOrchestration(mocks);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.currentSessionId).toBe("s2");

      act(() => {
        result.current.requestDeleteSession("s1");
      });
      await act(async () => {
        await result.current.confirmDeleteSession();
      });

      expect(result.current.currentSessionId).toBe("s2");
      expect(result.current.sessions.map((s) => s.sessionId)).toEqual(["s2"]);
      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
    });

    it("should call onDeleteError callback and leave optimistic removal in place on API failure", async () => {
      const only = makeSession({ sessionId: "s-only" });
      const mocks = makeMocks({ sessions: [only] });
      mocks.sessionServices.deleteSession.mockRejectedValue(new Error("boom"));
      const onDeleteError = vi.fn();

      const { result } = renderHook(() =>
        useChatPageOrchestration(
          {
            sessionServices: mocks.sessionServices,
            chatServices: mocks.chatServices,
          },
          { onDeleteError }
        )
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.requestDeleteSession("s-only");
      });
      await act(async () => {
        await result.current.confirmDeleteSession();
      });

      expect(onDeleteError).toHaveBeenCalledTimes(1);
      expect(result.current.sessions).toEqual([]);
      expect(result.current.currentSessionId).toBeNull();
      expect(mocks.sessionServices.createSession).not.toHaveBeenCalled();
    });
  });
});
