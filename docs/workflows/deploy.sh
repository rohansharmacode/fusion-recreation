#!/usr/bin/env bash
# Usage: bash deploy.sh "<commit message summary>"   (run from the fusion project root after `node scripts/build.mjs --release`)
set -e
MSG="$1"
ROOT="$(pwd)"
CRED=(-c credential.helper= -c "credential.helper=!gh auth git-credential")
REMOTE=https://github.com/rohansharmacode/fusion-recreation.git
TRAILER=$'\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
# 1) site -> gh-pages
cd "$ROOT/build/pages-stage"
git rm -q -r --cached . >/dev/null
find . -maxdepth 1 -type f ! -name .nojekyll -delete
cp "$ROOT"/release/{index.html,app.js,app.css,occt.gz.wasm} .
touch .nojekyll
git add -A
git commit -q -m "Deploy: $MSG$TRAILER" || echo "pages: nothing to commit"
git "${CRED[@]}" push -q "$REMOTE" gh-pages:gh-pages 2>&1 | grep -v "^warning" || true
# 2) source -> main
cd "$ROOT"
git add -A
git commit -q -m "$MSG$TRAILER" || echo "main: nothing to commit"
git "${CRED[@]}" push -q "$REMOTE" main 2>&1 | grep -v "^warning" || true
git log --oneline | head -1
