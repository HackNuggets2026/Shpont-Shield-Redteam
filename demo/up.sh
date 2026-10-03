#!/usr/bin/env bash
# Start Redteam and a Shpont-Shield gateway with decoys planted. The Shield checkout is never modified:
# its policy is copied to .run/policy.yaml, which is the file to edit during a demo.
set -euo pipefail
cd "$(dirname "$0")/.."
SHIELD="${SHIELD_PATH:-../Shpont-Shield}"
mkdir -p .run
fuser -k 8799/tcp 8787/tcp 2>/dev/null || true
.venv/bin/shield-redteam plant --policy "$SHIELD/policy.yaml" --out .run/policy.yaml --record-raw
# The shared organisation (ACME Bank) from Common-Database, when it is checked out next to this repo.
CDB="${COMMON_DB:-../Common-Database}"
if [ -f "$CDB/adapters/shpont_shield.py" ]; then
  (cd "$SHIELD" && .venv/bin/python "$OLDPWD/$CDB/adapters/shpont_shield.py" --policy "$OLDPWD/.run/policy.yaml")
  .venv/bin/python "$CDB/adapters/redteam.py" --config redteam.yaml --directory .run/data/org.json
fi
REDTEAM_POLICY_FILE="$PWD/.run/policy.yaml" BASE_FEED="$SHIELD/feeds/signatures.json" nohup .venv/bin/shield-redteam serve > .run/redteam.log 2>&1 &
sleep 2   # the gateway loads the feed from Redteam at start-up
(cd "$SHIELD" && nohup .venv/bin/python -m controllayer --policy "$OLDPWD/.run/policy.yaml" > "$OLDPWD/.run/shield.log" 2>&1 &)
sleep 3
.venv/bin/python demo/traffic.py --gateway http://127.0.0.1:8787 > .run/traffic.log 2>&1 || true
.venv/bin/python demo/trail.py --gateway http://127.0.0.1:8787 > .run/trail.log 2>&1 || true
echo "Redteam dashboard   http://127.0.0.1:8799/"
echo "Shield dashboard  http://127.0.0.1:8787/?token=demo-admin-token"
echo "Policy to edit    $(pwd)/.run/policy.yaml"
