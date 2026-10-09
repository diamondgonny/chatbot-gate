# P1-1 전환·롤백

a2_patch_500() {
  fault '^caddy\.admin\.patch' status:500,noapply times=1
  deploy B
  expect_code 1
  expect_reason SWITCH_NOT_APPLIED
  expect_untouched blue A
  expect_cid green absent
}
run_case "A2/patch-500-not-applied" a2_patch_500 'hit the serving container chatbot-gate-backend-blue'

a4_rollback_patch_500() {
  verification_fails
  fault '^caddy\.admin\.patch' status:500,noapply after='caddy\.admin\.patch' times=1
  deploy B
  expect_code 2
  expect_reason ROLLBACK_UNCONFIRMED
  expect_upstream green
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
}
run_case "A4/rollback-patch-500" a4_rollback_patch_500 'hit the serving container chatbot-gate-backend-green'
