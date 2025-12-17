"use client";

import axios from "axios";
import { handleAuthError } from "./authErrorHandler";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  withCredentials: true,
});

// baseURL이 설정되었는지 확인 (env var가 빈 문자열일 수 있는 test 환경용)
if (!apiClient.defaults.baseURL) {
  apiClient.defaults.baseURL = "http://localhost:4000";
}

// 모든 state 변경 요청에 cookie에서 CSRF token 첨부
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

// Auth error (401/403)를 전역적으로 처리 - authErrorHandler에 위임
apiClient.interceptors.response.use(
  (response) => response,
  handleAuthError
);

export default apiClient;
