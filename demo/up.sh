#!/usr/bin/env bash
# Start Probe and a Shpont-Shield gateway with decoys planted. The Shield checkout is never modified:
# its policy is copied to .run/policy.yaml, which is the file to edit during a demo.
set -euo pipefail
cd "$(dirname "$0")/.."
SHIELD="${SHIELD_PATH:-../Shpont-Shield}"
mkdir -p .run
fuser -k 8799/tcp 8787/tcp 2>/dev/null || true
.venv/bin/shpont-probe plant --policy "$SHIELD/policy.yaml" --out .run/policy.yaml
PROBE_POLICY_FILE="$PWD/.run/policy.yaml" BASE_FEED="$SHIELD/feeds/signatures.json" nohup .venv/bin/shpont-probe serve > .run/probe.log 2>&1 &
sleep 2   # the gateway loads the feed from Probe at start-up
(cd "$SHIELD" && nohup .venv/bin/python -m controllayer --policy "$OLDPWD/.run/policy.yaml" > "$OLDPWD/.run/shield.log" 2>&1 &)
sleep 3
echo "Probe dashboard   http://127.0.0.1:8799/"
echo "Shield dashboard  http://127.0.0.1:8787/?token=demo-admin-token"
echo "Policy to edit    $(pwd)/.run/policy.yaml"
