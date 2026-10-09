# P1-3 상태·동시 실행

c5_concurrent() {
  pause_in_verification verify
  deploy_bg first B
  wait_reached verify
  deploy B
  expect_code 1
  expect_reason LOCK_HELD
  expect_serving "green B"
  resume verify
  wait_bg first
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
run_case "C5/concurrent-run" c5_concurrent 'hit the serving container chatbot-gate-backend-green'

kill_in_verification() {
  pause_in_verification verify
  deploy_bg first B
  wait_reached verify
  kill_group first KILL
  wait_bg first
  # 상태 파일은 blue, 실제 upstream은 green
  deploy C
  expect_code 0
  expect_serving "blue C"
  expect_state blue C
}
run_case "KILL/during-verification" kill_in_verification 'hit the serving container chatbot-gate-backend-green'

# 상태 파일을 읽을 수 없으면 컨테이너를 건드리기 전에 실패한다.
c2_rejected_state() {  # <사유>
  deploy B
  expect_code 1
  expect_reason "$1"
  expect_upstream blue
  expect_serving "blue A"
  expect_cid blue same
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch)'
  [[ ! -e $APP/pwned ]] || fail "state file content was executed"
}
c2_missing() {
  rm "$APP/.deployment-state"
  c2_rejected_state STATE_MISSING
  [[ ! -e $APP/.deployment-state ]] || fail "state file was created"
}
c2_truncated() {
  printf 'ACTIVE_ENV=blue\nINACTIVE_ENV=gre' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
  expect_state_unchanged
}
c2_missing_key() {
  printf 'ACTIVE_ENV=blue\n' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
}
c2_bad_value() {
  printf 'ACTIVE_ENV=purple\nINACTIVE_ENV=green\n' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
}
c2_same_env() {
  printf 'ACTIVE_ENV=blue\nINACTIVE_ENV=blue\n' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
}
c2_shell_syntax() {
  printf 'ACTIVE_ENV=blue\nINACTIVE_ENV=green\nACTIVE_IMAGE=$(touch pwned)\n' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
  expect_state_unchanged
}
c2_unexpected_key() {
  printf 'ACTIVE_ENV=blue\nINACTIVE_ENV=green\nPATH=/nonexistent\n' > "$APP/.deployment-state"
  c2_rejected_state STATE_INVALID
  expect_state_unchanged
}
run_case "C2/missing" c2_missing
run_case "C2/truncated" c2_truncated
run_case "C2/missing-key" c2_missing_key
run_case "C2/bad-value" c2_bad_value
run_case "C2/same-env" c2_same_env
run_case "C2/shell-syntax" c2_shell_syntax
run_case "C2/unexpected-key" c2_unexpected_key
