/**
 * Shared API Layer
 *
 * 핵심 API client와 authentication endpoint
 */

export { default as apiClient } from "./client";
export { handleAuthError } from "./authErrorHandler";
export { checkAuthStatus, validateGateCode } from "./auth.api";
export { navigation } from "./navigation";
