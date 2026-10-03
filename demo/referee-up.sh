#!/usr/bin/env bash
# Start the team's other control layers next to Shield, so the Referee can test all of them with one corpus.
# Each is cloned (or updated) into .run/referee/<repo>, gets its own virtualenv, and runs offline with
# its own demo policy:  Mikołaj's fork on :8801, Behavior (warden) on :8802, SzpontShield on :8803.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=.run/referee
mkdir -p "$DIR"
fetch() {
  if [ -d "$DIR/$1/.git" ]; then git -C "$DIR/$1" pull -q --ff-only; else gh repo clone "HackNuggets2026/$1" "$DIR/$1" -- -q; fi
}
venv() {  # $1 repo, then the install arguments
  local repo=$1; shift
  [ -x "$DIR/$repo/.venv/bin/python" ] || python3 -m venv "$DIR/$repo/.venv"
  "$DIR/$repo/.venv/bin/pip" install -q "$@" >/dev/null
}
fuser -k 8801/tcp 8802/tcp 8803/tcp 2>/dev/null || true

fetch shpont-shield-mikolaj
venv shpont-shield-mikolaj -e "$DIR/shpont-shield-mikolaj"
(cd "$DIR/shpont-shield-mikolaj" && nohup .venv/bin/python -m controllayer --policy policy.yaml --port 8801 > ../mikolaj.log 2>&1 &)

fetch Shpont-Shield-Behavior
venv Shpont-Shield-Behavior -e "$DIR/Shpont-Shield-Behavior"
(cd "$DIR/Shpont-Shield-Behavior" && nohup .venv/bin/python -m warden --offline --port 8802 > ../behavior.log 2>&1 &)

fetch SzpontShield
venv SzpontShield -r "$DIR/SzpontShield/requirements.txt"
(cd "$DIR/SzpontShield" && nohup .venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8803 > ../szpont.log 2>&1 &)

sleep 6
for p in 8801 8802 8803; do printf ':%s ' "$p"; (ss -ltn | grep -q ":$p ") && echo up || echo "not up (see $DIR/*.log)"; done
