"use client";

import axios from "axios";
import { handleAuthError } from "./authErrorHandler";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  withCredentials: true,
});

// Ensure baseURL is set (for test environments where env var might be empty string)
if (!apiClient.defaults.baseURL) {
  apiClient.defaults.baseURL = "http://localhost:4000";
}

// Attach CSRF token from cookie to every state-changing request
apiClient.interceptors.request.use((config) => {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      config.headers.set("x-csrf-token", token);
    }
  }
  return config;
});

// Handle auth errors (401/403) globally - delegate to authErrorHandler
apiClient.interceptors.response.use(
  (response) => response,
  handleAuthError
);

export default apiClient;
