# 사례 공용 함수. run.sh가 사례 파일보다 먼저 불러온다.
# 사례는 함수 하나로 쓰고 run_case로 등록한다. 기대가 어긋나면 fail로 기록하고 계속 간다.

sim() { python3 -S "$LIB/sim.py" "$@"; }
fault() { sim fault "$@"; }
fail() { echo "$*" >> "$CASE_DIR/failures"; }

selected() {
  [[ ${#FILTERS[@]} -eq 0 ]] && return 0
  local f
  for f in "${FILTERS[@]}"; do [[ $1 == $f* ]] && return 0; done
  return 1
}

# run_case <ID> <함수> [기준 스크립트가 남겨야 할 불합격 사유(정규식)]
run_case() {
  local id="$1" fn="$2" signature="${3:-}"
  selected "$id" || return 0
  [[ -n $BASELINE && -z $signature ]] && return 0

  CASE_DIR="$WORK/${id//[\/ ]/_}"
  APP="$CASE_DIR/app"
  export SIM_DIR="$CASE_DIR/sim"
  mkdir -p "$APP/scripts"
  cp "$SCRIPT_SRC/scripts/deploy-blue-green.sh" "$APP/scripts/"
  cp "$SCRIPT_SRC/docker-compose.yml" "$APP/"
  sim init
  : > "$CASE_DIR/failures"

  (
    declare -A BG_PID=()
    RUN_N=0
    trap 'for p in "${BG_PID[@]}"; do kill -KILL -- "-$p" 2>/dev/null; done' EXIT
    state_default blue A
    "$fn"
  )

  # 사례와 무관하게 적용하는 판정
  local line
  while IFS= read -r line; do fail "invariant: $line"; done < "$SIM_DIR/violations"
  while IFS= read -r line; do fail "harness: fault never fired: $line"; done < <(sim unfired)
  if [[ -f $CASE_DIR/collateral && $(sim collateral) != "$(< "$CASE_DIR/collateral")" ]]; then
    fail "invariant: other Caddy config or the MongoDB container changed"
  fi

  local verdict=PASS
  [[ -s $CASE_DIR/failures ]] && verdict=FAIL
  if [[ -n $BASELINE ]]; then
    if [[ $verdict == FAIL ]] && grep -Eq "$signature" "$CASE_DIR/failures"; then
      verdict=CONFIRMED
    else
      verdict=UNCONFIRMED
    fi
  fi
  echo "$verdict $id"
  [[ $verdict == PASS ]] || sed 's/^/     /' "$CASE_DIR/failures"
  echo "$verdict $id" >> "$WORK/results"
}

# ---------------------------------------------------------------- 준비

other_env() { [[ $1 == blue ]] && echo green || echo blue; }

state_new() {  # <active> <라벨>
  printf 'ACTIVE_ENV=%s\nINACTIVE_ENV=%s\nACTIVE_IMAGE=%s\nUPDATED_AT=2026-10-09T00:00:00Z\n' \
    "$1" "$(other_env "$1")" "$(sim ref "$2")" > "$APP/.deployment-state"
}

state_legacy() {  # <active> <VERSION>
  local port=4000 other=4001
  [[ $1 == green ]] && port=4001 other=4000
  printf 'ACTIVE_ENV=%s\nACTIVE_PORT=%s\nINACTIVE_ENV=%s\nINACTIVE_PORT=%s\nLAST_DEPLOYMENT=2026-10-09T00:00:00Z\nVERSION=%s\n' \
    "$1" "$port" "$(other_env "$1")" "$other" "$2" > "$APP/.deployment-state"
}

state_default() {
  if [[ -n $BASELINE ]]; then state_legacy "$1" "main-$2"; else state_new "$1" "$2"; fi
}

# 실행 전 모습을 기억해 둔다. deploy가 처음 불릴 때 자동으로 부른다.
remember() {
  sim collateral > "$CASE_DIR/collateral"
  CID_BLUE=$(sim cid blue)
  CID_GREEN=$(sim cid green)
  cp "$APP/.deployment-state" "$CASE_DIR/state.before" 2>/dev/null || rm -f "$CASE_DIR/state.before"
}

# 전환 뒤 새 환경의 검증이 실패하게 한다.
verification_fails() {
  if [[ -n $BASELINE ]]; then
    fault '^backend\.health' fail after='caddy\.admin\.patch'
  else
    fault '^caddy\.http' status:502 after='caddy\.admin\.patch' times=2
  fi
}

# 전환 검증의 첫 요청에서 멈춘다.
pause_in_verification() {
  fault '^(backend\.health|caddy\.http)' "pause:$1" after='caddy\.admin\.patch' times=1
}

# ---------------------------------------------------------------- 실행

image_env() {
  if [[ -n $BASELINE ]]; then echo "VERSION=main-$1"; else echo "IMAGE_REF=$(sim ref "$1")"; fi
}

script_cmd() {  # 이후 인자: [VAR=VAL...] [-- 스크립트 인자...]
  local -a envs=() args=()
  while (($#)); do
    if [[ $1 == -- ]]; then shift; args=("$@"); break; fi
    envs+=("$1"); shift
  done
  CMD=(env -u VERSION -u IMAGE_REF -u CADDY_UPSTREAM_PATH "${envs[@]}" "PATH=$LIB/bin:$PATH"
       "$BASH" "$APP/scripts/deploy-blue-green.sh" "${args[@]}")
}

run_script() {
  [[ -f $CASE_DIR/collateral ]] || remember
  script_cmd "$@"
  RUN_N=$((RUN_N + 1))
  OUT="$CASE_DIR/out.$RUN_N"
  (cd "$APP" && exec "${CMD[@]}") > "$OUT" 2>&1
  RC=$?
}

deploy() {  # <라벨> [VAR=VAL...]
  local label="$1"; shift
  run_script "$(image_env "$label")" "$@"
}

# 별도 프로세스 그룹으로 띄운다. <이름> <라벨> [VAR=VAL...]
deploy_bg() {
  local name="$1" label="$2"; shift 2
  [[ -f $CASE_DIR/collateral ]] || remember
  script_cmd "$(image_env "$label")" "$@"
  (cd "$APP" && exec python3 -S -c 'import os, sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])' \
    "${CMD[@]}") > "$CASE_DIR/out.$name" 2>&1 &
  BG_PID[$name]=$!
}

wait_bg() {
  { wait "${BG_PID[$1]}"; } 2> /dev/null
  RC=$?
  OUT="$CASE_DIR/out.$1"
}

wait_reached() { sim wait-reached "$1" || fail "harness: pause point $1 was not reached"; }
resume() { sim resume "$1"; }
kill_group() { kill "-$2" -- "-${BG_PID[$1]}"; }   # <이름> <신호>
kill_parent() { kill -KILL "${BG_PID[$1]}"; }
group_alive() { kill -0 -- "-${BG_PID[$1]}" 2>/dev/null; }

# 출력된 수동 조치 명령을 그대로 실행한다.
run_manual() {
  local cmd found=
  while IFS= read -r cmd; do
    found=1
    (cd "$APP" && PATH="$LIB/bin:$PATH" "$BASH" -c "$cmd") > /dev/null 2>&1 || fail "manual command failed: $cmd"
  done < <(sed -n 's/^.*MANUAL> //p' "$OUT")
  [[ -n $found ]] || fail "no manual command was printed"
}

# ---------------------------------------------------------------- 판정

expect_code() { [[ $RC == "$1" ]] || fail "expected exit code $1, got $RC"; }

expect_reason() {
  local last
  last=$(grep '^DEPLOY_RESULT ' "$OUT" | tail -n 1)
  [[ $last == "DEPLOY_RESULT code=$RC reason=$1" ]] || fail "expected reason $1 with code $RC, got '${last:-no DEPLOY_RESULT line}'"
}

expect_out() { grep -Eq "$1" "$OUT" || fail "output does not match: $1"; }

expect_upstream() {
  local got; got=$(sim upstream)
  [[ $got == "$1" ]] || fail "expected upstream $1, got $got"
}

expect_serving() {  # "<env> <라벨>" 또는 none: Caddy 경유 응답
  local got; got=$(sim serving)
  [[ $got == "$1" ]] || fail "expected Caddy to serve '$1', got '$got'"
}

expect_state() {  # <active> <라벨>
  local want
  want=$(printf 'ACTIVE_ENV=%s\nINACTIVE_ENV=%s\nACTIVE_IMAGE=%s' "$1" "$(other_env "$1")" "$(sim ref "$2")")
  [[ $(grep -v '^UPDATED_AT=[0-9TZ:-]*$' "$APP/.deployment-state" 2>/dev/null) == "$want" ]] \
    || fail "expected state $1/$2, got: $(tr '\n' ' ' < "$APP/.deployment-state" 2>/dev/null)"
}

expect_state_unchanged() {
  cmp -s "$APP/.deployment-state" "$CASE_DIR/state.before" || fail "state file changed"
}

expect_cid() {  # <env> same|new|absent
  local before=$CID_BLUE now
  [[ $1 == green ]] && before=$CID_GREEN
  now=$(sim cid "$1")
  case $2 in
    same) [[ $now == "$before" && $now != absent ]] || fail "expected $1 container kept, now $now (was $before)" ;;
    new) [[ $now != "$before" && $now != absent ]] || fail "expected a new $1 container, now $now (was $before)" ;;
    absent) [[ $now == absent ]] || fail "expected no $1 container" ;;
  esac
}

expect_running() { [[ $(sim running "$1") == yes ]] || fail "expected $1 container running"; }
expect_label() { local got; got=$(sim label "$1"); [[ $got == "$2" ]] || fail "expected $1 to run image $2, it runs image $got"; }

ops() { cut -f2 "$SIM_DIR/calls.log"; }
expect_called() { ops | grep -Eq "$1" || fail "expected a call matching: $1"; }
expect_not_called() { ! ops | grep -Eq "$1" || fail "unexpected call matching: $1"; }

expect_quiet_after() {  # <표시>: 그 뒤로 PATCH·정지·삭제·상태 기록이 없다
  local got; got=$(sim mutations-after "$1" | tr '\n' ';')
  [[ -z $got ]] || fail "changes after $1: $got"
}

# 서빙이 실행 전 그대로다.
expect_untouched() {  # <서빙 env> <라벨>
  expect_upstream "$1"
  expect_serving "$1 $2"
  expect_cid "$1" same
  expect_state_unchanged
}
