# P1-1 전환·롤백

# 검증 실패 뒤 구 환경으로의 복귀가 확인된 모습
rolled_back() {
  expect_code 1
  expect_reason ROLLED_BACK
  expect_untouched blue A
  expect_cid green absent
}

# 어느 쪽도 지우지 않고 사람에게 넘긴 모습
both_kept() {
  expect_code 2
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
}

# 전환 PATCH와 롤백 PATCH 사이의 Caddy 경유 요청 수
checks_before_rollback() {
  ops | awk '/^caddy\.admin\.patch/ { n++ } n == 1 && /^caddy\.http/ { c++ } END { print c + 0 }'
}

clock() { cat "$SIM_DIR/clock"; }

# ---------------------------------------------------------------- A1 정상 전환

a1_both_directions() {
  deploy B
  expect_code 0
  expect_reason OK
  expect_serving "green B"
  expect_state green B
  expect_cid blue absent
  deploy C
  expect_code 0
  expect_serving "blue C"
  expect_state blue C
  expect_cid green absent
  # Caddy 컨테이너를 재생성하면 저장된 상태 파일을 env_file로 읽는다
  sim recreate-caddy "$APP/.deployment-state"
  expect_upstream blue
  expect_serving "blue C"
}
run_case "A1/both-directions-then-caddy-recreated" a1_both_directions

# ---------------------------------------------------------------- A2 PATCH 응답과 실제 적용이 어긋남

a2_not_applied() {  # <주입>
  fault '^caddy\.admin\.patch' "$1" times=1
  deploy B
  expect_code 1
  expect_reason SWITCH_NOT_APPLIED
  expect_untouched blue A
  expect_cid green absent
}
a2_patch_500() { a2_not_applied status:500,noapply; }
a2_patch_400() { a2_not_applied status:400,noapply; }
a2_patch_404() { a2_not_applied status:404,noapply; }
a2_patch_200_unchanged() { a2_not_applied noapply; }
run_case "A2/patch-500-not-applied" a2_patch_500 'hit the serving container chatbot-gate-backend-blue'
run_case "A2/patch-400-not-applied" a2_patch_400
run_case "A2/patch-404-not-applied" a2_patch_404
run_case "A2/patch-200-but-unchanged" a2_patch_200_unchanged

a2_applied_response_lost() {
  fault '^caddy\.admin\.patch' drop times=1
  deploy B
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
run_case "A2/applied-but-response-lost" a2_applied_response_lost

a2_admin_refused() {
  fault '^caddy\.admin' refuse after='caddy\.direct'
  deploy B
  both_kept
  expect_reason SWITCH_UNKNOWN
}
run_case "A2/admin-api-refused" a2_admin_refused

# ---------------------------------------------------------------- A3 전환 뒤 Caddy 경유 검증 실패

a3_routed_fails() {
  fault '^caddy\.http' status:502 after='caddy\.admin\.patch' times=2
  deploy B
  rolled_back
}
a3_immediate() {  # <주입>: 불일치와 비 JSON은 한 번으로 실패한다
  fault '^caddy\.http' "$1" after='caddy\.admin\.patch' times=1
  deploy B
  rolled_back
  [[ $(checks_before_rollback) == 1 ]] || fail "expected one check before rollback, got $(checks_before_rollback)"
}
a3_env_mismatch() { a3_immediate env:blue; }
a3_build_mismatch() { a3_immediate build:C; }
a3_not_json() { a3_immediate nonjson; }
a3_client_error() { a3_immediate status:404; }
a3_hang() {
  fault '^caddy\.http' hang after='caddy\.admin\.patch' times=2
  deploy B
  rolled_back
  (($(clock) <= 35)) || fail "took $(clock)s, limit 35s"
}
a3_hang_forever() {
  fault '^caddy\.http' hang after='caddy\.admin\.patch'
  deploy B
  both_kept
  expect_reason ROLLBACK_UNCONFIRMED
  (($(clock) <= 70)) || fail "took $(clock)s, limit 70s"
}
run_case "A3/routed-requests-fail" a3_routed_fails
run_case "A3/env-mismatch" a3_env_mismatch
run_case "A3/build-mismatch" a3_build_mismatch
run_case "A3/body-not-json" a3_not_json
run_case "A3/client-error" a3_client_error
run_case "A3/responses-hang" a3_hang
run_case "A3/responses-hang-forever" a3_hang_forever

# ---------------------------------------------------------------- A4 롤백 결과

a4_rollback_ok() {
  verification_fails
  deploy B
  rolled_back
}
run_case "A4/rollback-confirmed" a4_rollback_ok

a4_unconfirmed() {  # <남은 upstream>
  deploy B
  both_kept
  expect_reason ROLLBACK_UNCONFIRMED
  expect_upstream "$1"
}
a4_rollback_patch_500() {
  verification_fails
  fault '^caddy\.admin\.patch' status:500,noapply after='caddy\.admin\.patch' times=1
  a4_unconfirmed green
  # 안내된 명령으로 복귀한다
  run_manual
  expect_upstream blue
  expect_serving "blue A"
}
a4_rollback_patch_unchanged() {
  verification_fails
  fault '^caddy\.admin\.patch' noapply after='caddy\.admin\.patch' times=1
  a4_unconfirmed green
}
a4_old_other_build() {
  verification_fails
  fault '^caddy\.http' build:C after='caddy\.admin\.patch' after_n=2
  a4_unconfirmed blue
}
a4_old_not_responding() {
  verification_fails
  fault '^caddy\.http' status:502 after='caddy\.admin\.patch' after_n=2
  a4_unconfirmed blue
}
run_case "A4/rollback-patch-500" a4_rollback_patch_500 'hit the serving container chatbot-gate-backend-green'
run_case "A4/rollback-patch-unchanged" a4_rollback_patch_unchanged
run_case "A4/old-env-answers-another-build" a4_old_other_build
run_case "A4/old-env-not-responding" a4_old_not_responding

# ---------------------------------------------------------------- A5 일시적 실패 허용 범위

a5_one_transient() {
  fault '^caddy\.http' status:502 after='caddy\.admin\.patch' times=1
  deploy B
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
a5_two_transient() {
  fault '^caddy\.http' status:503 after='caddy\.admin\.patch' skip=1 times=2
  deploy B
  rolled_back
}
a5_last_check_fails() {
  fault '^caddy\.http' status:502 after='caddy\.admin\.patch' skip=4 times=1
  deploy B
  rolled_back
}
run_case "A5/one-transient-failure" a5_one_transient
run_case "A5/two-transient-failures" a5_two_transient
run_case "A5/only-last-check-fails" a5_last_check_fails
