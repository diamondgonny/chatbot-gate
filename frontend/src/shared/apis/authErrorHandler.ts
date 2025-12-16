"use client";

import type { AxiosError } from "axios";
import { navigation } from "./navigation";

/**
 * Handles authentication errors (401/403) by redirecting to gate.
 * Returns a never-resolving promise to prevent further error handling.
 *
 * @param error - The Axios error to handle
 * @returns A never-resolving promise if auth error, or rejects with the original error
 */
export function handleAuthError(error: AxiosError): Promise<never> {
  const status = error.response?.status;

  if (status === 401 || status === 403) {
    // Skip redirect if already on gate page - let error propagate normally
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      return Promise.reject(error);
    }

    // Redirect to gate page
    navigation.goToGate();

    // Return a never-resolving promise to prevent further error handling
    return new Promise(() => {});
  }

  return Promise.reject(error);
}
