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

b2_dotenv_version() {
  printf 'VERSION=main\nIMAGE_REF=%s\n' "$(sim ref A)" > "$APP/.env"
  deploy B
  expect_code 0
  expect_label green B
  expect_serving "green B"
  expect_state green B
}
run_case "B2/dotenv-version" b2_dotenv_version

b3_moved_tag() {
  sim set registry.tags.main '"C"'
  sim set registry.tags.latest '"C"'
  deploy B
  expect_code 0
  expect_label green B
  expect_serving "green B"
}
run_case "B3/tag-moved-after-checks" b3_moved_tag

# 입력 오류는 컨테이너를 건드리기 전에 거부한다.
b5_rejected_input() {
  run_script "$@"
  expect_code 1
  expect_reason INPUT_INVALID
  expect_untouched blue A
  expect_not_called '^(pull|compose\.|container\.|caddy\.admin\.patch)'
}
b5_missing() { b5_rejected_input; }
b5_version_only() { b5_rejected_input VERSION=main-B; }
b5_tag_only() { b5_rejected_input IMAGE_REF=main-B; }
b5_full_tag() { b5_rejected_input IMAGE_REF=ghcr.io/diamondgonny/chatbot-gate/chatbot-gate-backend:main; }
b5_short_digest() { b5_rejected_input IMAGE_REF=ghcr.io/diamondgonny/chatbot-gate/chatbot-gate-backend@sha256:abc123; }
b5_other_repo() { b5_rejected_input "IMAGE_REF=ghcr.io/someone/else@sha256:$(printf 'a%.0s' {1..64})"; }
run_case "B5/missing" b5_missing
run_case "B5/version-only" b5_version_only
run_case "B5/tag-only" b5_tag_only
run_case "B5/full-tag" b5_full_tag
run_case "B5/short-digest" b5_short_digest
run_case "B5/other-repo" b5_other_repo

b5_pull_failed() {
  expect_code 1
  expect_reason PULL_FAILED
  expect_untouched blue A
  expect_cid green absent
  expect_not_called '^(compose\.up|caddy\.admin\.patch)'
  [[ $(sim local) == A ]] || fail "expected only image A locally, got $(sim local)"
}
b5_unknown_digest() {
  run_script "IMAGE_REF=ghcr.io/diamondgonny/chatbot-gate/chatbot-gate-backend@sha256:$(printf 'f%.0s' {1..64})"
  b5_pull_failed
}
b5_pull_denied() {
  sim set registry.tags.latest '"B"'
  fault '^pull' fail
  deploy B
  b5_pull_failed
}
run_case "B5/unknown-digest" b5_unknown_digest
run_case "B5/pull-denied" b5_pull_denied
