"use client";

import axios from "axios";
import { navigation } from "./navigation";

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

// Handle 401/403 responses globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401 || status === 403) {
      // Redirect to gate page
      navigation.goToGate();

      // Return a never-resolving promise to prevent further error handling
      return new Promise(() => {});
    }

    return Promise.reject(error);
  }
);

export default apiClient;
