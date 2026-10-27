#!/usr/bin/env bash
# Kører Claude Code mange gange i træk på POLISH.md.
# Brug:  ./polish-loop.sh 20      (20 iterationer, standard 10)
# Kør i spillets mappe, på en ren git-branch.

set -e
RUNS=${1:-10}

git checkout -B polish
mkdir -p polish

for i in $(seq 1 "$RUNS"); do
  echo "=== Iteration $i af $RUNS ==="
  claude -p "$(cat POLISH.md)" \
    --permission-mode acceptEdits \
    --allowedTools "Bash(npm *),Bash(npx *),Bash(git *),Bash(node *),Read,Edit,Write,Glob,Grep,Agent,mcp__playwright" \
    >> polish/run-output.log 2>&1 || echo "Iteration $i fejlede – fortsætter"
  sleep 5
done

echo "Færdig. Se polish/LOG.md og 'git log polish'."
