import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSidebar } from "@/features/chat";
import type { Session } from "@/features/chat";

const mockSessions: Session[] = [
  {
    sessionId: "session-1",
    title: "First Chat",
    lastMessage: null,
    updatedAt: "2024-01-03T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    sessionId: "session-2",
    title: "Second Chat",
    lastMessage: {
      role: "user",
      content: "Hello there",
      timestamp: "2024-01-02T00:00:00Z",
    },
    updatedAt: "2024-01-02T00:00:00Z",
    createdAt: "2024-01-02T00:00:00Z",
  },
];

describe("SessionSidebar Integration", () => {
  describe("rendering", () => {
    it("should display all sessions", () => {
      render(<SessionSidebar sessions={mockSessions} />);

      expect(screen.getByText("First Chat")).toBeInTheDocument();
      expect(screen.getByText("Hello there")).toBeInTheDocument();
    });

    it("should display 'New Chat' button", () => {
      render(<SessionSidebar sessions={mockSessions} />);

      expect(
        screen.getByRole("button", { name: /new chat/i })
      ).toBeInTheDocument();
    });

    it("should display 'Back to Hub' link", () => {
      render(<SessionSidebar sessions={mockSessions} />);

      expect(screen.getByRole("link", { name: /back to hub/i })).toHaveAttribute(
        "href",
        "/hub"
      );
    });

    it("should display empty state when no sessions", () => {
      render(<SessionSidebar sessions={[]} />);

      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
    });

    it("should display loading state", () => {
      render(<SessionSidebar loading={true} />);

      expect(screen.getByText(/loading sessions/i)).toBeInTheDocument();
    });
  });

  describe("user interactions", () => {
    it("should call onNewChat when 'New Chat' button is clicked", async () => {
      const onNewChat = vi.fn();
      const user = userEvent.setup();

      render(<SessionSidebar sessions={mockSessions} onNewChat={onNewChat} />);

      await user.click(screen.getByRole("button", { name: /new chat/i }));

      expect(onNewChat).toHaveBeenCalledTimes(1);
    });

    it("should call onSessionSelect with session ID when session is clicked", async () => {
      const onSessionSelect = vi.fn();
      const user = userEvent.setup();

      render(
        <SessionSidebar
          sessions={mockSessions}
          onSessionSelect={onSessionSelect}
        />
      );

      await user.click(screen.getByText("First Chat"));

      expect(onSessionSelect).toHaveBeenCalledWith("session-1");
    });

    it("should call onDeleteSession with session ID when delete button is clicked", async () => {
      const onDeleteSession = vi.fn();
      const user = userEvent.setup();

      render(
        <SessionSidebar
          sessions={mockSessions}
          onDeleteSession={onDeleteSession}
        />
      );

      // Find the session item and its delete button
      const deleteButtons = screen.getAllByTitle("Delete session");
      await user.click(deleteButtons[0]);

      expect(onDeleteSession).toHaveBeenCalledWith("session-1");
    });

    it("should not call onSessionSelect when clicking delete button", async () => {
      const onSessionSelect = vi.fn();
      const onDeleteSession = vi.fn();
      const user = userEvent.setup();

      render(
        <SessionSidebar
          sessions={mockSessions}
          onSessionSelect={onSessionSelect}
          onDeleteSession={onDeleteSession}
        />
      );

      const deleteButtons = screen.getAllByTitle("Delete session");
      await user.click(deleteButtons[0]);

      expect(onDeleteSession).toHaveBeenCalled();
      expect(onSessionSelect).not.toHaveBeenCalled();
    });
  });

  describe("visual states", () => {
    it("should highlight the current session", () => {
      const { container } = render(
        <SessionSidebar sessions={mockSessions} currentSessionId="session-1" />
      );

      // Find the session item with active styling
      const sessionItems = container.querySelectorAll("[class*='bg-slate-700']");
      expect(sessionItems.length).toBeGreaterThan(0);
    });

    it("should show loading indicator on loading session", () => {
      render(
        <SessionSidebar sessions={mockSessions} loadingSessionId="session-1" />
      );

      // Loading session should show spinner
      expect(screen.getByText("⟳")).toBeInTheDocument();
    });

    it("should disable session buttons when loading", () => {
      render(
        <SessionSidebar
          sessions={mockSessions}
          loadingSessionId="session-1"
        />
      );

      // Loading session should have disabled button
      const sessionButton = screen
        .getByText("First Chat")
        .closest("button") as HTMLButtonElement;

      expect(sessionButton).toBeDisabled();
    });
  });
});
