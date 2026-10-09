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

# ---------------------------------------------------------------- C1 상태와 upstream 불일치

c1_stale_state() {
  state_new green B   # 실제 서빙은 blue A
  deploy C
  expect_code 0
  expect_cid blue absent
  expect_serving "green C"
  expect_state green C
}
run_case "C1/stale-state" c1_stale_state

# 배포가 전환 전에 실패해도 교정한 상태는 남는다.
c1_stale_state_corrected() {
  state_new green B
  fault '^pull' fail
  deploy C
  expect_code 1
  expect_reason PULL_FAILED
  expect_upstream blue
  expect_serving "blue A"
  expect_cid blue same
  expect_state blue A
}
run_case "C1/stale-state-corrected" c1_stale_state_corrected

# Caddy가 Caddyfile을 다시 읽어 dial이 예전 환경으로 돌아간 경우
c1_dial_reverted() {
  sim backend green B
  state_new green B
  deploy C
  expect_code 0
  expect_cid green new
  expect_serving "green C"
  expect_state green C
}
run_case "C1/dial-reverted-to-placeholder" c1_dial_reverted

c1_unverified() {  # <사유>
  state_new green B
  deploy C
  expect_code 1
  expect_reason "$1"
  expect_upstream blue
  expect_cid blue same
  expect_state_unchanged
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch|mv )'
}
c1_only_internal_ok() {
  fault '^caddy\.http' status:502
  c1_unverified SERVING_UNVERIFIED
}
c1_image_unknown() {
  sim set local '{}'
  c1_unverified SERVING_IMAGE_UNKNOWN
}
run_case "C1/only-internal-health-ok" c1_only_internal_ok
run_case "C1/image-check-fails" c1_image_unknown

c1_upstream_dead_state_healthy() {
  sim backend green B
  sim set c.blue.running false
  state_new green B
  deploy C
  expect_code 1
  expect_reason UPSTREAM_DEAD
  expect_cid green same
  expect_cid blue same
  expect_state_unchanged
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch|mv )'
  run_manual
  expect_serving "green B"
}
run_case "C1/upstream-dead-state-healthy" c1_upstream_dead_state_healthy

# ---------------------------------------------------------------- C3 upstream을 확정할 수 없음

c3_rejected() {  # <사유> [VAR=VAL...]
  local reason="$1"; shift
  sim mark start
  deploy B "$@"
  expect_code 1
  expect_reason "$reason"
  expect_quiet_after start
  expect_cid blue same
  expect_state_unchanged
}
c3_query_failed() { fault '^caddy\.admin\.get' refuse; c3_rejected UPSTREAM_QUERY_FAILED; }
c3_unknown_target() { sim dial chatbot-gate-backend-purple:4000; c3_rejected UPSTREAM_TARGET_UNKNOWN; }
c3_not_backend() { sim dial other-app:3000; c3_rejected UPSTREAM_TARGET_UNKNOWN; }
c3_env_missing() { sim set containers.caddy.env '{}'; c3_rejected UPSTREAM_ENV_UNRESOLVED; }
c3_env_invalid() { sim set containers.caddy.env '{"ACTIVE_ENV":"purple"}'; c3_rejected UPSTREAM_ENV_UNRESOLVED; }
c3_two_dials() {
  sim set caddy.servers.srv0.routes.1.handle.0.routes.0.handle.0.upstreams \
    '[{"dial":"chatbot-gate-backend-blue:4000"},{"dial":"chatbot-gate-backend-green:4000"}]'
  c3_rejected UPSTREAM_AMBIGUOUS
}
c3_two_paths() {
  sim set caddy.servers.srv0.routes.0.handle.0.routes.0.handle.0.upstreams '[{"dial":"chatbot-gate-backend-green:4000"}]'
  c3_rejected UPSTREAM_AMBIGUOUS
}
c3_path_of_other_site() {
  c3_rejected UPSTREAM_PATH_MISMATCH CADDY_UPSTREAM_PATH=/config/apps/http/servers/srv0/routes/0/handle/0/routes/0/handle/0/upstreams
}
run_case "C3/query-failed" c3_query_failed
run_case "C3/unknown-target" c3_unknown_target
run_case "C3/not-a-backend-target" c3_not_backend
run_case "C3/caddy-env-missing" c3_env_missing
run_case "C3/caddy-env-invalid" c3_env_invalid
run_case "C3/two-dials" c3_two_dials
run_case "C3/two-upstream-paths" c3_two_paths
run_case "C3/path-of-another-site" c3_path_of_other_site

# ---------------------------------------------------------------- C7 구 상태 형식에서의 첫 실행

c7_legacy_tagged() {
  sim drop blue
  sim backend blue A main   # 태그로 받은 컨테이너
  state_legacy blue main
}
c7_first_run() {
  c7_legacy_tagged
  deploy B
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
c7_state_converted() {
  c7_legacy_tagged
  fault '^pull' fail
  deploy B
  expect_code 1
  expect_reason PULL_FAILED
  expect_cid blue same
  expect_state blue A
}
c7_no_identifier() {
  sim drop blue
  sim backend blue N main
  state_legacy blue main
  deploy B
  expect_code 1
  expect_reason SERVING_NO_IDENTIFIER
  expect_out 'identifier'
  expect_upstream blue
  expect_cid blue same
  expect_state_unchanged
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch|mv )'
}
run_case "C7/legacy-state-first-run" c7_first_run
run_case "C7/legacy-state-converted" c7_state_converted
run_case "C7/serving-has-no-identifier" c7_no_identifier

# ---------------------------------------------------------------- C8 서빙이 없는 상태의 복구 배포

c8_active_dead() {
  sim set c.blue.running false
  deploy B
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
c8_new_host() {
  sim drop blue
  printf 'ACTIVE_ENV=blue\nINACTIVE_ENV=green\nACTIVE_IMAGE=\nUPDATED_AT=2026-10-09T00:00:00Z\n' > "$APP/.deployment-state"
  deploy B
  expect_code 0
  expect_serving "green B"
  expect_state green B
}
run_case "C8/active-dead-recovery" c8_active_dead
run_case "C8/new-host-first-deploy" c8_new_host

# 복구 배포의 검증이 실패하면 죽은 구 환경으로 돌아간 것을 성공으로 치지 않는다.
c8_recovery_fails() {
  sim set c.blue.running false
  verification_fails
  deploy B
  expect_code 2
  expect_reason RECOVERY_FAILED
  expect_cid blue same
  expect_cid green new
  expect_state_unchanged
  expect_out 'MANUAL> '
}
run_case "C8/recovery-verification-fails" c8_recovery_fails
