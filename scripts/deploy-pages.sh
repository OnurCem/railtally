#!/usr/bin/env bash
# Builds the app for GitHub Pages and publishes dist/ to the gh-pages branch with plain git.
# Usage: scripts/deploy-pages.sh            (project site, base /railtally/)
#        BASE_PATH=/ scripts/deploy-pages.sh (custom domain: also put a CNAME file in public/)
# Every publish triggers GitHub's built-in "pages build and deployment" run, so deploy deliberately.
set -euo pipefail

cd "$(dirname "$0")/.."
export BASE_PATH="${BASE_PATH:-/railtally/}"
remote="$(git remote get-url origin)"
commit="$(git rev-parse --short HEAD)"
name="$(git config user.name || echo deploy)"
email="$(git config user.email || echo deploy@localhost)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes; commit them first." >&2
  exit 1
fi

npm run build

touch dist/.nojekyll
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R dist/. "$work/"
cd "$work"
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $commit"
git push -f "$remote" gh-pages
echo "Published $commit to gh-pages (base $BASE_PATH)."
