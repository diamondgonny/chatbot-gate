"use client";

import type { AxiosError } from "axios";
import { navigation } from "./navigation";

/**
 * 인증 error (401/403)를 처리하여 gate로 redirect
 * 추가 error 처리를 방지하기 위해 영구 pending promise 반환
 *
 * @param error - 처리할 Axios error
 * @returns Auth error인 경우 영구 pending promise, 아니면 원본 error로 reject
 */
export function handleAuthError(error: AxiosError): Promise<never> {
  const status = error.response?.status;

  if (status === 401 || status === 403) {
    // 이미 gate page에 있으면 redirect 건너뛰기 - error를 정상적으로 전파
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      return Promise.reject(error);
    }

    // Gate page로 redirect
    navigation.goToGate();

    // 추가 error 처리를 방지하기 위해 영구 pending promise 반환
    return new Promise(() => {});
  }

  return Promise.reject(error);
}
