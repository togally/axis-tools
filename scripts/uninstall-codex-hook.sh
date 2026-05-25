#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$HOME/.codex/plugins/local/observability"
CONFIG_FILE="$HOME/.codex/config.toml"
TMP_CONFIG="$(mktemp)"

rm -rf "$PLUGIN_DIR"

python3 - <<'PY' "$CONFIG_FILE" "$TMP_CONFIG"
import sys
from pathlib import Path
config_path, tmp_path = sys.argv[1:3]
path = Path(config_path)
text = path.read_text(encoding='utf-8') if path.exists() else ''
marker = '[plugins."orbit-observability@local"]'
if marker in text:
    before, after = text.split(marker, 1)
    lines = after.splitlines()
    kept = []
    skipping = True
    for line in lines:
        if skipping and (line.startswith('enabled = ') or line.startswith('path = ') or line.strip() == ''):
            continue
        skipping = False
        kept.append(line)
    text = before.rstrip() + '\n' + '\n'.join(kept).lstrip('\n')
Path(tmp_path).write_text(text, encoding='utf-8')
PY
mv "$TMP_CONFIG" "$CONFIG_FILE"

echo "[axis-tools] Codex observability hook removed"
echo "plugin_dir=$PLUGIN_DIR"
