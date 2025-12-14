/**
 * Re-render Isolation Tests
 *
 * These tests verify that splitting CouncilContext into separate contexts
 * (Messages, Stream, Status) properly isolates re-renders.
 *
 * Key principle: Components should only re-render when their specific
 * subscribed context changes, not when unrelated context changes.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  CouncilMessagesProvider,
  useCouncilMessagesContext,
  CouncilStreamProvider,
  useCouncilStreamContext,
  CouncilStatusProvider,
  useCouncilStatusContext,
} from "@/features/council/state";

// ============================================
// Test Components that track render counts
// ============================================

/**
 * Component that only subscribes to Messages context
 */
function MessagesConsumer({ onRender }: { onRender: () => void }) {
  const { messages } = useCouncilMessagesContext();

  useEffect(() => {
    onRender();
  });

  return (
    <div data-testid="messages-consumer">Messages: {messages.length}</div>
  );
}

/**
 * Component that only subscribes to Stream context
 */
function StreamConsumer({ onRender }: { onRender: () => void }) {
  const { stage1StreamingContent } = useCouncilStreamContext();

  useEffect(() => {
    onRender();
  });

  const contentLength = Object.values(stage1StreamingContent).join("").length;

  return (
    <div data-testid="stream-consumer">Stream length: {contentLength}</div>
  );
}

/**
 * Component that only subscribes to Status context
 */
function StatusConsumer({ onRender }: { onRender: () => void }) {
  const { isProcessing } = useCouncilStatusContext();

  useEffect(() => {
    onRender();
  });

  return (
    <div data-testid="status-consumer">
      Processing: {isProcessing ? "yes" : "no"}
    </div>
  );
}

/**
 * Combined providers wrapper for testing
 */
function AllProvidersWrapper({ children }: { children: ReactNode }) {
  return (
    <CouncilMessagesProvider>
      <CouncilStreamProvider>
        <CouncilStatusProvider>{children}</CouncilStatusProvider>
      </CouncilStreamProvider>
    </CouncilMessagesProvider>
  );
}

// ============================================
// Re-render Isolation Tests
// ============================================

describe("Context Re-render Isolation", () => {
  describe("Stream updates should NOT trigger Messages/Status re-renders", () => {
    it("should not re-render MessagesConsumer when stream content changes", async () => {
      const messagesRenderCount = vi.fn();
      const streamRenderCount = vi.fn();

      // Component that can update stream context
      function StreamUpdater() {
        const { updateStreamContent } = useCouncilStreamContext();

        return (
          <button
            data-testid="update-stream"
            onClick={() =>
              updateStreamContent("gpt-4o", "New streaming content")
            }
          >
            Update Stream
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <MessagesConsumer onRender={messagesRenderCount} />
          <StreamConsumer onRender={streamRenderCount} />
          <StreamUpdater />
        </AllProvidersWrapper>
      );

      // Initial renders
      expect(messagesRenderCount).toHaveBeenCalledTimes(1);
      expect(streamRenderCount).toHaveBeenCalledTimes(1);

      // Update stream content
      await act(async () => {
        screen.getByTestId("update-stream").click();
      });

      // Stream consumer should re-render
      expect(streamRenderCount).toHaveBeenCalledTimes(2);

      // Messages consumer should NOT re-render
      expect(messagesRenderCount).toHaveBeenCalledTimes(1);
    });

    it("should not re-render StatusConsumer when stream content changes", async () => {
      const statusRenderCount = vi.fn();
      const streamRenderCount = vi.fn();

      function StreamUpdater() {
        const { updateStreamContent } = useCouncilStreamContext();

        return (
          <button
            data-testid="update-stream"
            onClick={() =>
              updateStreamContent("claude-3-5-sonnet", "More content")
            }
          >
            Update Stream
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <StatusConsumer onRender={statusRenderCount} />
          <StreamConsumer onRender={streamRenderCount} />
          <StreamUpdater />
        </AllProvidersWrapper>
      );

      expect(statusRenderCount).toHaveBeenCalledTimes(1);
      expect(streamRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId("update-stream").click();
      });

      expect(streamRenderCount).toHaveBeenCalledTimes(2);
      expect(statusRenderCount).toHaveBeenCalledTimes(1);
    });
  });

  describe("Status updates should NOT trigger Messages/Stream re-renders", () => {
    it("should not re-render MessagesConsumer when isProcessing changes", async () => {
      const messagesRenderCount = vi.fn();
      const statusRenderCount = vi.fn();

      function StatusUpdater() {
        const { setProcessing } = useCouncilStatusContext();

        return (
          <button
            data-testid="toggle-processing"
            onClick={() => setProcessing(true)}
          >
            Start Processing
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <MessagesConsumer onRender={messagesRenderCount} />
          <StatusConsumer onRender={statusRenderCount} />
          <StatusUpdater />
        </AllProvidersWrapper>
      );

      expect(messagesRenderCount).toHaveBeenCalledTimes(1);
      expect(statusRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId("toggle-processing").click();
      });

      expect(statusRenderCount).toHaveBeenCalledTimes(2);
      expect(messagesRenderCount).toHaveBeenCalledTimes(1);
    });

    it("should not re-render StreamConsumer when isProcessing changes", async () => {
      const streamRenderCount = vi.fn();
      const statusRenderCount = vi.fn();

      function StatusUpdater() {
        const { setProcessing } = useCouncilStatusContext();

        return (
          <button
            data-testid="toggle-processing"
            onClick={() => setProcessing(true)}
          >
            Start Processing
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <StreamConsumer onRender={streamRenderCount} />
          <StatusConsumer onRender={statusRenderCount} />
          <StatusUpdater />
        </AllProvidersWrapper>
      );

      expect(streamRenderCount).toHaveBeenCalledTimes(1);
      expect(statusRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId("toggle-processing").click();
      });

      expect(statusRenderCount).toHaveBeenCalledTimes(2);
      expect(streamRenderCount).toHaveBeenCalledTimes(1);
    });
  });

  describe("Messages updates should NOT trigger Stream/Status re-renders", () => {
    it("should not re-render StreamConsumer when messages change", async () => {
      const streamRenderCount = vi.fn();
      const messagesRenderCount = vi.fn();

      function MessagesUpdater() {
        const { addMessage } = useCouncilMessagesContext();

        return (
          <button
            data-testid="add-message"
            onClick={() =>
              addMessage({
                role: "user",
                content: "Hello",
                timestamp: new Date().toISOString(),
              })
            }
          >
            Add Message
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <StreamConsumer onRender={streamRenderCount} />
          <MessagesConsumer onRender={messagesRenderCount} />
          <MessagesUpdater />
        </AllProvidersWrapper>
      );

      expect(streamRenderCount).toHaveBeenCalledTimes(1);
      expect(messagesRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId("add-message").click();
      });

      expect(messagesRenderCount).toHaveBeenCalledTimes(2);
      expect(streamRenderCount).toHaveBeenCalledTimes(1);
    });

    it("should not re-render StatusConsumer when messages change", async () => {
      const statusRenderCount = vi.fn();
      const messagesRenderCount = vi.fn();

      function MessagesUpdater() {
        const { addMessage } = useCouncilMessagesContext();

        return (
          <button
            data-testid="add-message"
            onClick={() =>
              addMessage({
                role: "user",
                content: "Another message",
                timestamp: new Date().toISOString(),
              })
            }
          >
            Add Message
          </button>
        );
      }

      render(
        <AllProvidersWrapper>
          <StatusConsumer onRender={statusRenderCount} />
          <MessagesConsumer onRender={messagesRenderCount} />
          <MessagesUpdater />
        </AllProvidersWrapper>
      );

      expect(statusRenderCount).toHaveBeenCalledTimes(1);
      expect(messagesRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId("add-message").click();
      });

      expect(messagesRenderCount).toHaveBeenCalledTimes(2);
      expect(statusRenderCount).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Context Individual Functionality", () => {
  describe("CouncilMessagesContext", () => {
    it("should provide messages array", () => {
      function TestComponent() {
        const { messages } = useCouncilMessagesContext();
        return <div data-testid="messages-count">{messages.length}</div>;
      }

      render(
        <CouncilMessagesProvider>
          <TestComponent />
        </CouncilMessagesProvider>
      );

      expect(screen.getByTestId("messages-count").textContent).toBe("0");
    });

    it("should allow adding messages", async () => {
      function TestComponent() {
        const { messages, addMessage } = useCouncilMessagesContext();

        return (
          <>
            <div data-testid="messages-count">{messages.length}</div>
            <button
              data-testid="add-btn"
              onClick={() =>
                addMessage({
                  role: "user",
                  content: "Test",
                  timestamp: new Date().toISOString(),
                })
              }
            >
              Add
            </button>
          </>
        );
      }

      render(
        <CouncilMessagesProvider>
          <TestComponent />
        </CouncilMessagesProvider>
      );

      expect(screen.getByTestId("messages-count").textContent).toBe("0");

      await act(async () => {
        screen.getByTestId("add-btn").click();
      });

      expect(screen.getByTestId("messages-count").textContent).toBe("1");
    });
  });

  describe("CouncilStreamContext", () => {
    it("should provide streaming content", () => {
      function TestComponent() {
        const { stage1StreamingContent } = useCouncilStreamContext();
        return (
          <div data-testid="stream-keys">
            {Object.keys(stage1StreamingContent).length}
          </div>
        );
      }

      render(
        <CouncilStreamProvider>
          <TestComponent />
        </CouncilStreamProvider>
      );

      expect(screen.getByTestId("stream-keys").textContent).toBe("0");
    });

    it("should allow updating streaming content", async () => {
      function TestComponent() {
        const { stage1StreamingContent, updateStreamContent } =
          useCouncilStreamContext();

        return (
          <>
            <div data-testid="stream-content">
              {stage1StreamingContent["gpt-4o"] || "empty"}
            </div>
            <button
              data-testid="update-btn"
              onClick={() => updateStreamContent("gpt-4o", "Hello from GPT")}
            >
              Update
            </button>
          </>
        );
      }

      render(
        <CouncilStreamProvider>
          <TestComponent />
        </CouncilStreamProvider>
      );

      expect(screen.getByTestId("stream-content").textContent).toBe("empty");

      await act(async () => {
        screen.getByTestId("update-btn").click();
      });

      expect(screen.getByTestId("stream-content").textContent).toBe(
        "Hello from GPT"
      );
    });
  });

  describe("CouncilStatusContext", () => {
    it("should provide status flags", () => {
      function TestComponent() {
        const { isProcessing, isLoading, error } = useCouncilStatusContext();

        return (
          <>
            <div data-testid="processing">{isProcessing ? "yes" : "no"}</div>
            <div data-testid="loading">{isLoading ? "yes" : "no"}</div>
            <div data-testid="error">{error || "none"}</div>
          </>
        );
      }

      render(
        <CouncilStatusProvider>
          <TestComponent />
        </CouncilStatusProvider>
      );

      expect(screen.getByTestId("processing").textContent).toBe("no");
      expect(screen.getByTestId("loading").textContent).toBe("no");
      expect(screen.getByTestId("error").textContent).toBe("none");
    });

    it("should allow updating status flags", async () => {
      function TestComponent() {
        const { isProcessing, setProcessing, setError, error } =
          useCouncilStatusContext();

        return (
          <>
            <div data-testid="processing">{isProcessing ? "yes" : "no"}</div>
            <div data-testid="error">{error || "none"}</div>
            <button
              data-testid="start-btn"
              onClick={() => setProcessing(true)}
            >
              Start
            </button>
            <button
              data-testid="error-btn"
              onClick={() => setError("Something went wrong")}
            >
              Set Error
            </button>
          </>
        );
      }

      render(
        <CouncilStatusProvider>
          <TestComponent />
        </CouncilStatusProvider>
      );

      expect(screen.getByTestId("processing").textContent).toBe("no");

      await act(async () => {
        screen.getByTestId("start-btn").click();
      });

      expect(screen.getByTestId("processing").textContent).toBe("yes");

      await act(async () => {
        screen.getByTestId("error-btn").click();
      });

      expect(screen.getByTestId("error").textContent).toBe(
        "Something went wrong"
      );
    });
  });
});
