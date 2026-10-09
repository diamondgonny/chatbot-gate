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

# 잠금을 쥔 부모만 죽고 자식이 살아 있으면 잠금은 유지된다.
c5_parent_killed() {
  fault '^compose\.up' pause:up times=1
  deploy_bg first B
  wait_reached up
  kill_parent first
  wait_bg first
  group_alive first || fail "harness: the child process is gone"
  sim mark second
  deploy C
  expect_code 1
  expect_reason LOCK_HELD
  expect_quiet_after second
  expect_untouched blue A
  resume up
  local waited=0
  while group_alive first; do
    sleep 0.1
    ((++waited < 50)) || { fail "child still alive after 5s"; return; }
  done
  # 관련 프로세스가 모두 끝나면 바로 잠금을 얻는다
  deploy C
  expect_code 0
  expect_serving "green C"
  expect_state green C
}
run_case "C5/parent-killed-child-alive" c5_parent_killed

c5_group_killed() {
  fault '^compose\.up' pause:up times=1
  deploy_bg first B
  wait_reached up
  kill_group first KILL
  wait_bg first
  deploy C
  expect_code 0
  expect_serving "green C"
  expect_state green C
}
run_case "C5/group-killed" c5_group_killed

# 신호를 받으면 더 바꾸지 않고 끝낸다.
term_before_patch() {
  fault '^caddy\.admin\.patch' pause:patch times=1
  deploy_bg first B
  wait_reached patch
  sim mark signal
  kill_group first TERM
  wait_bg first
  expect_code 2
  expect_reason INTERRUPTED
  expect_quiet_after signal
  expect_untouched blue A
  expect_cid green new
}
run_case "TERM/before-patch" term_before_patch

term_in_verification() {
  pause_in_verification verify
  deploy_bg first B
  wait_reached verify
  sim mark signal
  kill_group first TERM
  wait_bg first
  expect_code 2
  expect_reason INTERRUPTED
  expect_quiet_after signal
  expect_upstream green
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
}
run_case "TERM/during-verification" term_in_verification
