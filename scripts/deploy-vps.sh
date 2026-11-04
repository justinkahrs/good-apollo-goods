#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Deploy only from main (current branch: $branch)." >&2
  exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean; commit or discard local changes first." >&2
  exit 2
fi

git fetch --quiet origin main
commit="$(git rev-parse HEAD)"
if [[ "$commit" != "$(git rev-parse origin/main)" ]]; then
  echo "Local main must match origin/main. Pull the reviewed release commit first." >&2
  exit 2
fi

short_commit="${commit:0:12}"
tag="gag-commerce:$(date -u +%Y%m%dT%H%M%SZ)-$short_commit"

echo "Deploying reviewed main commit $commit as $tag"
git archive --format=tar HEAD | ssh -T senna-gag-deploy "deploy $tag $commit"
