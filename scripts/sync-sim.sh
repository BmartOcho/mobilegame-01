#!/usr/bin/env bash
# Copies the shared simulation into the edge-function tree. Supabase bundles
# only files under supabase/functions, so the copy is committed.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf supabase/functions/_shared/sim
mkdir -p supabase/functions/_shared/sim
cp packages/sim/src/*.ts supabase/functions/_shared/sim/
echo "synced $(ls supabase/functions/_shared/sim | wc -l) files"
