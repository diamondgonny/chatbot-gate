"use client";

import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4000",
  withCredentials: true,
});

// Attach CSRF token from cookie to every state-changing request
api.interceptors.request.use((config) => {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      config.headers.set("x-csrf-token", token);
    }
  }
  return config;
});

export default api;
