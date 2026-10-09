# 회귀

r1_unreachable_from_caddy() {
  sim set new_container.networks '["backend_internal"]'
  deploy B
  expect_code 1
  expect_reason NEW_UNREACHABLE
  expect_untouched blue A
  expect_cid green absent
  expect_not_called '^caddy\.admin\.patch'
}
run_case "R1/unreachable-from-caddy" r1_unreachable_from_caddy 'expected exit code 1, got 0'

r2_find_upstream() {
  sim mark start
  run_script -- --find-upstream
  expect_code 0
  expect_out '/config/apps/http/servers/srv0/routes/1/handle/0/routes/0/handle/0/upstreams'
  expect_quiet_after start
  expect_untouched blue A
  [[ ! -e $APP/.deploy.lock ]] || fail "lock file was created"
}
run_case "R2/find-upstream" r2_find_upstream

r1_unhealthy() {
  sim set new_container.health '"unhealthy"'
  deploy B
  expect_code 1
  expect_reason NEW_UNHEALTHY
  expect_untouched blue A
  expect_cid green absent
  expect_not_called '^caddy\.admin\.patch'
}
r1_no_identifier() {
  deploy N
  expect_code 1
  expect_reason IMAGE_NO_IDENTIFIER
  expect_untouched blue A
  expect_not_called '^(compose\.up|caddy\.admin\.patch)'
}
run_case "R1/new-container-unhealthy" r1_unhealthy
run_case "R1/image-without-identifier" r1_no_identifier
