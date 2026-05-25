#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$HOME/.codex/plugins/local/observability"
CONFIG_FILE="$HOME/.codex/config.toml"
CLI_PATH="$ROOT/dist/cli.js"
HOOKS_SRC="$ROOT/examples/hooks.json"
HOOKS_DST="$PLUGIN_DIR/hooks.json"
PLUGIN_JSON="$PLUGIN_DIR/.codex-plugin/plugin.json"
TMP_HOOKS="$(mktemp)"
TMP_CONFIG="$(mktemp)"

mkdir -p "$PLUGIN_DIR/.codex-plugin"

if [ ! -f "$CLI_PATH" ]; then
  echo "[axis-tools] dist/cli.js not found, building..."
  (cd "$ROOT" && npm run build >/dev/null)
fi

python3 - <<'PY' "$HOOKS_SRC" "$TMP_HOOKS" "$CLI_PATH"
import json, sys
src, dst, cli = sys.argv[1:4]
with open(src, 'r', encoding='utf-8') as f:
    data = json.load(f)
for event_handlers in data.get('hooks', {}).values():
    for handler in event_handlers:
        for hook in handler.get('hooks', []):
            if hook.get('type') == 'command':
                hook['command'] = f'node {cli} codex-hook ingest'
with open(dst, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
PY

cat > "$PLUGIN_JSON" <<'JSON'
{
  "name": "orbit-observability",
  "version": "0.1.0",
  "description": "Local Codex observability hooks for Orbit via axis-tools CLI.",
  "author": {
    "name": "Jasper",
    "email": "local@orbit",
    "url": "https://orbit.local"
  },
  "homepage": "https://orbit.local/axis-tools",
  "repository": "https://orbit.local/axis-tools",
  "license": "UNLICENSED",
  "keywords": ["orbit", "codex", "hooks", "observability"],
  "hooks": "./hooks.json",
  "interface": {
    "displayName": "Orbit Observability",
    "shortDescription": "Local hooks that stream Codex progress into .codex-status",
    "longDescription": "Installs local Codex hooks that forward official hook events into axis-tools so Orbit can observe Codex progress.",
    "developerName": "Orbit",
    "category": "Coding",
    "capabilities": ["Read", "Write"],
    "defaultPrompt": [
      "Monitor Codex progress for this repo."
    ],
    "brandColor": "#7C3AED"
  }
}
JSON

mv "$TMP_HOOKS" "$HOOKS_DST"

python3 - <<'PY' "$CONFIG_FILE" "$TMP_CONFIG" "$PLUGIN_DIR"
import sys
from pathlib import Path
config_path, tmp_path, plugin_dir = sys.argv[1:4]
path = Path(config_path)
text = path.read_text(encoding='utf-8') if path.exists() else ''
section = f'\n[plugins."orbit-observability@local"]\nenabled = true\nsource = "{plugin_dir}"\n'
if '[plugins."orbit-observability@local"]' in text:
    import re
    text = re.sub(r'\[plugins\."orbit-observability@local"\]\n(?:enabled = .*\n)?(?:path|source) = ".*"\n?', section.lstrip('\n'), text)
else:
    text = text.rstrip() + '\n' + section
Path(tmp_path).write_text(text, encoding='utf-8')
PY
mv "$TMP_CONFIG" "$CONFIG_FILE"

echo "[axis-tools] Codex observability hook installed"
echo "plugin_dir=$PLUGIN_DIR"
echo "config=$CONFIG_FILE"
echo "hooks=$HOOKS_DST"
