"use client";

import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  withCredentials: true,
});

// Flag to prevent multiple redirects
let isRedirecting = false;

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
    if (typeof window !== "undefined" && !isRedirecting) {
      const status = error.response?.status;

      if (status === 401 || status === 403) {
        isRedirecting = true;

        // Redirect to gate page
        window.location.href = "/";

        // Return a never-resolving promise to prevent further error handling
        return new Promise(() => {});
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
