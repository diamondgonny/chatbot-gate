#!/bin/bash
set -uo pipefail

#############################################
# Automatic deployment gate
#
# Compares what a CI run built with the latest commit of the remote branch.
# Only the paths that trigger the workflow are compared, tree against tree,
# so commit identity and ancestry do not matter: a later docs-only commit or
# a force push that kept the backend content still allows the deployment.
#
# Usage: ci-compare-content.sh <own commit> [remote] [branch]
#
# Exit codes:
#   0   same content: deploy
#   10  content differs: a newer build exists or this one was dropped, skip
#   *   the remote or the comparison failed: stop
#############################################

OWN="${1:?usage: ci-compare-content.sh <own commit> [remote] [branch]}"
REMOTE="${2:-origin}"
BRANCH="${3:-main}"
# Keep in sync with on.push.paths in .github/workflows/ci-cd.yml
PATHS=(backend .github/workflows/ci-cd.yml)

if ! git fetch --quiet --no-tags "${REMOTE}" "${BRANCH}"; then
  echo "Cannot fetch ${BRANCH} from ${REMOTE}" >&2
  exit 2
fi
if ! LATEST=$(git rev-parse --verify --quiet 'FETCH_HEAD^{commit}'); then
  echo "Cannot resolve the latest commit of ${REMOTE}/${BRANCH}" >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "${OWN}^{commit}" > /dev/null; then
  echo "Commit ${OWN} is not available in this checkout" >&2
  exit 2
fi

git diff --quiet "${OWN}" "${LATEST}" -- "${PATHS[@]}"
case $? in
  0)
    echo "Content of ${OWN} matches ${REMOTE}/${BRANCH} (${LATEST})"
    exit 0
    ;;
  1)
    echo "Content of ${OWN} differs from ${REMOTE}/${BRANCH} (${LATEST})"
    exit 10
    ;;
  *)
    echo "Cannot compare ${OWN} with ${LATEST}" >&2
    exit 2
    ;;
esac
