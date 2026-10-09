# B7 자동 배포 허용 규칙. 워크플로가 쓰는 비교 스크립트를 임시 저장소에서 그대로 실행한다.

g() { GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }

# 원격(main)과 그 복제본을 만든다. 복제본이 CI의 체크아웃 역할이다.
b7_repo() {
  REMOTE="$CASE_DIR/remote.git"
  CLONE="$CASE_DIR/clone"
  g init -q --bare -b main "$REMOTE"
  g clone -q "$REMOTE" "$CLONE" 2> /dev/null
  cd "$CLONE"
  mkdir -p backend/src .github/workflows docs frontend
  echo v1 > backend/src/app.ts
  echo v1 > .github/workflows/ci-cd.yml
  echo v1 > docs/README.md
  echo v1 > frontend/page.tsx
  b7_commit base
  g push -q origin HEAD:main
}
b7_commit() { g add -A && g commit -q -m "$1" && g rev-parse HEAD; }
b7_compare() {  # <자기 커밋>
  RC=0
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null "$BASH" "$SCRIPT_SRC/scripts/ci-compare-content.sh" "$1" origin main > "$CASE_DIR/out.compare" 2>&1 || RC=$?
  OUT="$CASE_DIR/out.compare"
}
b7_expect() { [[ $RC == "$1" ]] || fail "expected exit code $1, got $RC: $(tr '\n' ' ' < "$OUT")"; }

b7_same_commit() {
  b7_repo
  b7_compare "$(g rev-parse HEAD)"
  b7_expect 0
}
b7_docs_only_newer() {
  b7_repo
  local own; own=$(g rev-parse HEAD)
  echo v2 > docs/README.md; echo v2 > frontend/page.tsx
  b7_commit docs > /dev/null
  g push -q origin HEAD:main
  b7_compare "$own"
  b7_expect 0
}
b7_force_pushed_same_content() {
  b7_repo
  echo v2 > backend/src/app.ts
  local own; own=$(b7_commit change)
  g push -q origin HEAD:main
  # 같은 내용을 다른 커밋으로 다시 써서 강제 푸시한다
  g reset -q --soft HEAD~1
  echo v2 > docs/README.md
  b7_commit rewritten > /dev/null
  g push -q --force origin HEAD:main
  g merge-base --is-ancestor "$own" origin/main 2> /dev/null && fail "harness: own commit is still in main"
  b7_compare "$own"
  b7_expect 0
}
b7_backend_changed() {
  b7_repo
  local own; own=$(g rev-parse HEAD)
  echo v2 > backend/src/app.ts
  b7_commit backend > /dev/null
  g push -q origin HEAD:main
  b7_compare "$own"
  b7_expect 10
}
b7_workflow_changed() {
  b7_repo
  local own; own=$(g rev-parse HEAD)
  echo v2 > .github/workflows/ci-cd.yml
  b7_commit workflow > /dev/null
  g push -q origin HEAD:main
  b7_compare "$own"
  b7_expect 10
}
b7_own_change_removed() {
  b7_repo
  echo v2 > backend/src/app.ts
  local own; own=$(b7_commit change)
  g push -q origin HEAD:main
  g reset -q --hard HEAD~1
  g push -q --force origin HEAD:main
  b7_compare "$own"
  b7_expect 10
}
b7_remote_unreachable() {
  b7_repo
  g remote set-url origin "$CASE_DIR/missing.git"
  b7_compare "$(g rev-parse HEAD)"
  [[ $RC != 0 && $RC != 10 ]] || fail "expected an error, got $RC"
}
b7_compare_fails() {
  b7_repo
  b7_compare 0123456789abcdef0123456789abcdef01234567
  [[ $RC != 0 && $RC != 10 ]] || fail "expected an error, got $RC"
}
run_case "B7/same-commit" b7_same_commit
run_case "B7/newer-commit-docs-and-frontend-only" b7_docs_only_newer
run_case "B7/force-pushed-away-same-content" b7_force_pushed_same_content
run_case "B7/newer-backend-content" b7_backend_changed
run_case "B7/newer-workflow-content" b7_workflow_changed
run_case "B7/own-backend-change-removed" b7_own_change_removed
run_case "B7/remote-unreachable" b7_remote_unreachable
run_case "B7/compare-command-fails" b7_compare_fails
