#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf '[axis-tools] scripts/install-orbit-tools.sh is deprecated; use scripts/install-axis-tools.sh.\n' >&2
if [ -f "$script_dir/install-axis-tools.sh" ]; then
  exec bash "$script_dir/install-axis-tools.sh" "$@"
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash -s -- "$@"
  exit $?
fi

printf '[axis-tools] ERROR: install-axis-tools.sh was not found next to this wrapper and curl is not available.\n' >&2
exit 1
