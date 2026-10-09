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
