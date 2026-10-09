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

# docker 조회가 "없음"이 아닌 이유로 실패하면 없는 것으로 치지 않는다.
d2_inspect_fails() {
  fault '^inspect chatbot-gate-backend-blue' fail times=1
  deploy B
  expect_code 2
  expect_reason UNCLASSIFIED
  expect_untouched blue A
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch|mv )'
}
run_case "D2/inspect-fails" d2_inspect_fails

# 실패한 새 컨테이너를 치우려는데 upstream을 읽을 수 없으면 서빙을 확인하지 못한 것이다.
d2_upstream_unknown_at_cleanup() {
  sim set new_container.health '"unhealthy"'
  fault '^caddy\.admin\.get' refuse after='compose\.up'
  deploy B
  expect_code 2
  expect_reason UPSTREAM_CHANGED
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
}
run_case "D2/upstream-unknown-at-cleanup" d2_upstream_unknown_at_cleanup
