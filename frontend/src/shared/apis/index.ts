/**
 * Shared API Layer
 *
 * Core API client and authentication endpoints.
 */

export { default as apiClient } from "./client";
export { checkAuthStatus, validateGateCode } from "./auth.api";
export { navigation } from "./navigation";
