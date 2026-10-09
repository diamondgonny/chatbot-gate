#!/usr/bin/env bash
# 배포 스크립트 인수 사례 실행기(가짜 Docker 층).
#
#   ./run.sh [ID 접두어...]      현재 스크립트로 사례를 실행한다
#   ./run.sh --baseline          기준 커밋의 스크립트가 재현 사례에서 불합격하는지 확인한다

if ((BASH_VERSINFO[0] < 5)); then
  # 운영은 bash 5.3이다. macOS의 /bin/bash(3.2)로는 실행하지 않는다.
  for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
    [[ -x $candidate ]] && exec "$candidate" "$0" "$@"
  done
  echo "bash 5 or newer is required" >&2
  exit 2
fi
set -uo pipefail

for tool in flock python3; do
  command -v "$tool" > /dev/null || { echo "$tool is required" >&2; exit 2; }
done

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HARNESS_DIR/lib"
SCRIPT_SRC="$(cd "$HARNESS_DIR/../.." && pwd)"
BASELINE_COMMIT=6598cea
BASELINE=
FILTERS=()
for arg in "$@"; do
  if [[ $arg == --baseline ]]; then BASELINE=1; else FILTERS+=("$arg"); fi
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/deploy-harness.XXXXXX")"
: > "$WORK/results"

if [[ -n $BASELINE ]]; then
  SCRIPT_SRC="$WORK/baseline"
  mkdir -p "$SCRIPT_SRC/scripts"
  git -C "$HARNESS_DIR" show "$BASELINE_COMMIT:backend/scripts/deploy-blue-green.sh" > "$SCRIPT_SRC/scripts/deploy-blue-green.sh" &&
    git -C "$HARNESS_DIR" show "$BASELINE_COMMIT:backend/docker-compose.yml" > "$SCRIPT_SRC/docker-compose.yml" ||
    { echo "cannot read the baseline commit $BASELINE_COMMIT" >&2; exit 2; }
fi

# shellcheck source=lib/common.sh
source "$LIB/common.sh"

# 사례 파일은 서로 독립이라 병렬로 돌린다.
for file in "$HARNESS_DIR"/cases/*.sh; do
  # shellcheck disable=SC1090
  (source "$file") > "$WORK/log.$(basename "$file")" 2>&1 &
done
wait
cat "$WORK"/log.*

total=$(wc -l < "$WORK/results" | tr -d ' ')
bad=$(grep -Evc '^(PASS|CONFIRMED) ' "$WORK/results")
echo
if [[ -n $BASELINE ]]; then
  echo "baseline $BASELINE_COMMIT: $((total - bad))/$total reproduction cases fail as recorded"
else
  echo "$((total - bad))/$total passed"
fi
if ((bad > 0 || total == 0)); then
  echo "work dir kept: $WORK"
  exit 1
fi
rm -rf "$WORK"
