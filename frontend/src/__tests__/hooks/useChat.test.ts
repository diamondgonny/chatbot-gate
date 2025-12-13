import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../setup/msw-handlers";
import { useChat } from "@/hooks/useChat";
import type { Message } from "@/types";

describe("useChat", () => {
  describe("initial state", () => {
    it("should initialize with empty messages", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.messages).toEqual([]);
    });

    it("should initialize with empty input", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.input).toBe("");
    });

    it("should initialize with isLoading true", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isLoading).toBe(true);
    });

    it("should initialize with isTyping false", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isTyping).toBe(false);
    });
  });

  describe("loadChatHistory", () => {
    it("should fetch and return mapped messages", async () => {
      const { result } = renderHook(() => useChat());

      let loadedMessages: Message[] = [];
      await act(async () => {
        loadedMessages = await result.current.loadChatHistory("session-1");
      });

      expect(loadedMessages).toHaveLength(2);
      expect(loadedMessages[0]).toMatchObject({
        id: expect.stringContaining("loaded_"),
        role: "user",
        content: "Hello",
      });
    });

    it("should map 'ai' role correctly from API response", async () => {
      const { result } = renderHook(() => useChat());

      let loadedMessages: Message[] = [];
      await act(async () => {
        loadedMessages = await result.current.loadChatHistory("session-1");
      });

      const aiMessage = loadedMessages.find((m) => m.role === "ai");
      expect(aiMessage).toBeDefined();
      expect(aiMessage?.content).toBe("Hi there!");
    });

    it("should return empty array on API error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      server.use(
        http.get("*/api/chat/history", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const { result } = renderHook(() => useChat());

      let loadedMessages: Message[] = [];
      await act(async () => {
        loadedMessages = await result.current.loadChatHistory("session-1");
      });

      expect(loadedMessages).toEqual([]);
      consoleSpy.mockRestore();
    });

    it("should return empty array when no messages exist", async () => {
      server.use(
        http.get("*/api/chat/history", () => {
          return HttpResponse.json({ messages: [] });
        })
      );

      const { result } = renderHook(() => useChat());

      let loadedMessages: Message[] = [];
      await act(async () => {
        loadedMessages = await result.current.loadChatHistory("empty-session");
      });

      expect(loadedMessages).toEqual([]);
    });
  });

  describe("sendMessage", () => {
    it("should set isTyping to false after completion", async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("Hello", "session-1");
      });

      expect(result.current.isTyping).toBe(false);
    });

    it("should return AI message on success", async () => {
      const { result } = renderHook(() => useChat());

      let aiMessage: Message | null = null;
      await act(async () => {
        aiMessage = await result.current.sendMessage("Hello", "session-1");
      });

      expect(aiMessage).toMatchObject({
        role: "ai",
        content: expect.stringContaining("Echo: Hello"),
      });
    });

    it("should return fallback message on error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      server.use(
        http.post("*/api/chat/message", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const { result } = renderHook(() => useChat());

      let aiMessage: Message | null = null;
      await act(async () => {
        aiMessage = await result.current.sendMessage("Hello", "session-1");
      });

      expect(aiMessage).toMatchObject({
        role: "ai",
        content: "Sorry, something went wrong.",
      });
      consoleSpy.mockRestore();
    });

    it("should set isTyping to false even on error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      server.use(
        http.post("*/api/chat/message", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("Hello", "session-1");
      });

      expect(result.current.isTyping).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe("setters", () => {
    it("should allow setting messages", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setMessages([
          { id: "1", role: "user", content: "Test", timestamp: "" },
        ]);
      });

      expect(result.current.messages).toHaveLength(1);
    });

    it("should allow setting input", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setInput("new input");
      });

      expect(result.current.input).toBe("new input");
    });

    it("should allow setting isLoading", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setIsLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("refs", () => {
    it("should provide messagesEndRef", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.messagesEndRef).toBeDefined();
      expect(result.current.messagesEndRef.current).toBeNull();
    });

    it("should provide intendedSessionRef", () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.intendedSessionRef).toBeDefined();
      expect(result.current.intendedSessionRef.current).toBeNull();
    });
  });

  describe("scrollToBottom", () => {
    it("should be a callable function", () => {
      const { result } = renderHook(() => useChat());
      expect(typeof result.current.scrollToBottom).toBe("function");

      // Should not throw when called
      expect(() => result.current.scrollToBottom()).not.toThrow();
    });
  });
});
