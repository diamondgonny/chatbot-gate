# 실패 전파

# 스크립트가 분류하지 않은 명령이 실패하면 더 바꾸지 않고 2로 끝낸다.
d2_before_switch() {
  fault '^done:compose\.up' datefail times=1
  deploy B
  expect_code 2
  expect_reason UNCLASSIFIED
  expect_quiet_after injected
  expect_untouched blue A
  expect_cid green new
}
run_case "D2/unclassified-before-switch" d2_before_switch

d2_after_switch() {
  fault '^done:caddy\.admin\.patch' datefail times=1
  deploy B
  expect_code 2
  expect_reason UNCLASSIFIED
  expect_quiet_after injected
  expect_upstream green
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
}
run_case "D2/unclassified-after-switch" d2_after_switch
