/**
 * 테스트 가능성을 위한 navigation 추상화
 * window.location 작업을 추상화하여 계약 기반 테스트 활성화
 */
export const navigation = {
  /**
   * Gate page로 이동
   * 인증 실패 시 사용 (401/403)
   */
  goToGate: () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },
};
