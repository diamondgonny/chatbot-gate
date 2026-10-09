# P1-2 이미지

b2_state_version() {
  state_legacy blue main   # 레지스트리의 :main은 A
  deploy B
  expect_code 0
  expect_label green B
  expect_serving "green B"
  expect_state green B
}
run_case "B2/state-file-version" b2_state_version 'expected green to run image B, it runs image A'
