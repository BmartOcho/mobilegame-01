#!/usr/bin/env bash
# Copies the shared simulation next to the edge function. Supabase bundles
# only files under the function directory, so the copy is committed.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf supabase/functions/submit-turn/sim
mkdir -p supabase/functions/submit-turn/sim
cp packages/sim/src/*.ts supabase/functions/submit-turn/sim/
echo "synced $(ls supabase/functions/submit-turn/sim | wc -l) files"
