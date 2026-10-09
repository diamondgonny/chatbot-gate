# 회귀

r1_unreachable_from_caddy() {
  sim set new_container.networks '["backend_internal"]'
  deploy B
  expect_code 1
  expect_reason NEW_UNREACHABLE
  expect_untouched blue A
}
run_case "R1/unreachable-from-caddy" r1_unreachable_from_caddy 'expected exit code 1, got 0'
