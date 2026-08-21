#!/usr/bin/env bash
# Fast local checks — the same ones CI would run. Fails loudly on the first problem.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> typecheck"; npx tsc --noEmit
echo "==> tests";     node --import tsx --test tests/*.test.ts >/dev/null
echo "==> build";     npm run build >/dev/null
echo "All checks passed."
