import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw-handlers";

// Set environment variables for tests
process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
});

// Clean up after all tests
afterAll(() => server.close());

// Mock window.location
const locationState = new URL("http://localhost/__test__");
const mockLocation = {
  get href() {
    return locationState.href;
  },
  set href(value: string) {
    locationState.href = new URL(value, locationState.href).href;
  },
  get pathname() {
    return locationState.pathname;
  },
  set pathname(value: string) {
    locationState.pathname = value;
  },
  get origin() {
    return locationState.origin;
  },
  assign: vi.fn((value: string) => {
    mockLocation.href = value;
  }),
  replace: vi.fn((value: string) => {
    mockLocation.href = value;
  }),
};

Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Reset location mock before each test
beforeEach(() => {
  mockLocation.href = "http://localhost/__test__";
  mockLocation.assign.mockClear();
  mockLocation.replace.mockClear();
});

// Mock document.cookie (writable)
let cookieValue = "";
Object.defineProperty(document, "cookie", {
  get: () => cookieValue,
  set: (value: string) => {
    cookieValue = value;
  },
  configurable: true,
});

// Reset cookie before each test
beforeEach(() => {
  cookieValue = "";
});

// Mock Element.scrollIntoView (not implemented in JSDOM)
Element.prototype.scrollIntoView = vi.fn();
