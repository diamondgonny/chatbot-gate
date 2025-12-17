/**
 * userId 관리를 위한 authentication utility 함수
 */

export const saveUserId = (userId: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem("userId", userId);
  }
};

export const getUserId = (): string | null => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("userId");
  }
  return null;
};

export const clearAuth = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("userId");
  }
};

export const isAuthenticated = (): boolean => {
  return !!getUserId();
};
