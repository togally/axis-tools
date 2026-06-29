#!/usr/bin/env bash
set -euo pipefail

AXIS_TOOLS_DIR="${AXIS_TOOLS_DIR:-$HOME/axis-tools}"
AXIS_TOOLS_REPO="${AXIS_TOOLS_REPO:-https://github.com/togally/axis-tools.git}"
AXIS_TOOLS_BRANCH="${AXIS_TOOLS_BRANCH:-main}"
AXIS_TOOLS_FORCE="${AXIS_TOOLS_FORCE:-0}"
AXIS_TOOLS_BINS="axis axis-tools"

log() {
  printf '[axis-tools] %s\n' "$*"
}

warn() {
  printf '[axis-tools] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[axis-tools] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "$1 is required but was not found in PATH. Install $1 and run this script again."
  fi
}

normalize_repo_url() {
  url="$1"
  case "$url" in
    git@github.com:*)
      url="https://github.com/${url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      url="https://github.com/${url#ssh://git@github.com/}"
      ;;
  esac
  printf '%s' "$url" | sed -e 's#/*$##' -e 's#\.git$##'
}

remote_matches_expected_repo() {
  actual="$(git -C "$AXIS_TOOLS_DIR" remote get-url origin 2>/dev/null || true)"
  if [ -z "$actual" ]; then
    return 1
  fi

  normalized_actual="$(normalize_repo_url "$actual")"
  normalized_expected="$(normalize_repo_url "$AXIS_TOOLS_REPO")"
  [ "$normalized_actual" = "$normalized_expected" ]
}

has_local_changes() {
  ! git -C "$AXIS_TOOLS_DIR" diff --quiet ||
    ! git -C "$AXIS_TOOLS_DIR" diff --cached --quiet ||
    [ -n "$(git -C "$AXIS_TOOLS_DIR" ls-files --others --exclude-standard)" ]
}

clone_repo() {
  parent_dir="$(dirname "$AXIS_TOOLS_DIR")"
  mkdir -p "$parent_dir"
  log "Cloning $AXIS_TOOLS_REPO into $AXIS_TOOLS_DIR"
  git clone --branch "$AXIS_TOOLS_BRANCH" "$AXIS_TOOLS_REPO" "$AXIS_TOOLS_DIR"
}

ensure_expected_repo() {
  if ! git -C "$AXIS_TOOLS_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    die "$AXIS_TOOLS_DIR already exists but is not a git repo. Move it aside or set AXIS_TOOLS_DIR to another path."
  fi

  if ! remote_matches_expected_repo; then
    actual="$(git -C "$AXIS_TOOLS_DIR" remote get-url origin 2>/dev/null || printf '<missing>')"
    die "$AXIS_TOOLS_DIR is not the expected axis-tools repo. origin is '$actual', expected '$AXIS_TOOLS_REPO'. Override AXIS_TOOLS_REPO if this checkout intentionally uses another remote."
  fi
}

ensure_branch() {
  current_branch="$(git -C "$AXIS_TOOLS_DIR" rev-parse --abbrev-ref HEAD)"
  if [ "$current_branch" = "$AXIS_TOOLS_BRANCH" ]; then
    return 0
  fi

  if [ "$AXIS_TOOLS_FORCE" != "1" ]; then
    die "$AXIS_TOOLS_DIR is on branch '$current_branch', expected '$AXIS_TOOLS_BRANCH'. Check out the expected branch or rerun with AXIS_TOOLS_FORCE=1."
  fi

  log "Checking out $AXIS_TOOLS_BRANCH because AXIS_TOOLS_FORCE=1"
  if git -C "$AXIS_TOOLS_DIR" show-ref --verify --quiet "refs/heads/$AXIS_TOOLS_BRANCH"; then
    git -C "$AXIS_TOOLS_DIR" checkout "$AXIS_TOOLS_BRANCH"
  else
    git -C "$AXIS_TOOLS_DIR" checkout -B "$AXIS_TOOLS_BRANCH" "origin/$AXIS_TOOLS_BRANCH"
  fi
}

update_repo() {
  ensure_expected_repo
  log "Fetching origin/$AXIS_TOOLS_BRANCH"
  git -C "$AXIS_TOOLS_DIR" fetch origin "$AXIS_TOOLS_BRANCH"

  ensure_branch

  if [ "$AXIS_TOOLS_FORCE" = "1" ]; then
    log "Resetting to origin/$AXIS_TOOLS_BRANCH because AXIS_TOOLS_FORCE=1"
    git -C "$AXIS_TOOLS_DIR" reset --hard "origin/$AXIS_TOOLS_BRANCH"
    return 0
  fi

  if has_local_changes; then
    die "$AXIS_TOOLS_DIR has local changes. Commit or stash them, then rerun. To discard them, rerun with AXIS_TOOLS_FORCE=1."
  fi

  local_rev="$(git -C "$AXIS_TOOLS_DIR" rev-parse HEAD)"
  remote_rev="$(git -C "$AXIS_TOOLS_DIR" rev-parse "origin/$AXIS_TOOLS_BRANCH")"
  base_rev="$(git -C "$AXIS_TOOLS_DIR" merge-base HEAD "origin/$AXIS_TOOLS_BRANCH")"

  if [ "$local_rev" = "$remote_rev" ]; then
    log "Repository is already up to date"
  elif [ "$local_rev" = "$base_rev" ]; then
    log "Pulling latest code"
    git -C "$AXIS_TOOLS_DIR" pull --ff-only origin "$AXIS_TOOLS_BRANCH"
  elif [ "$remote_rev" = "$base_rev" ]; then
    die "$AXIS_TOOLS_DIR has local commits not on origin/$AXIS_TOOLS_BRANCH. Push, rebase, or rerun with AXIS_TOOLS_FORCE=1 to discard them."
  else
    die "$AXIS_TOOLS_DIR has diverged from origin/$AXIS_TOOLS_BRANCH. Resolve it manually or rerun with AXIS_TOOLS_FORCE=1 to discard local history."
  fi
}

install_cli() {
  log "Installing npm dependencies"
  (cd "$AXIS_TOOLS_DIR" && npm install)

  log "Building Axis CLI"
  (cd "$AXIS_TOOLS_DIR" && npm run build)

  log "Linking global axis command"
  (cd "$AXIS_TOOLS_DIR" && npm link --force)

  npm_bin="$(npm prefix -g)/bin"
  expose_linked_bins "$npm_bin"
}

expose_linked_bins() {
  npm_bin="$1"
  if command -v axis >/dev/null 2>&1 || [ ! -e "$npm_bin/axis" ]; then
    return 0
  fi

  local_bin="$HOME/.local/bin"
  log "axis is linked under $npm_bin but is not in PATH; exposing commands in $local_bin"
  mkdir -p "$local_bin"

  for bin in $AXIS_TOOLS_BINS; do
    source_path="$npm_bin/$bin"
    target_path="$local_bin/$bin"

    if [ ! -e "$source_path" ]; then
      warn "Skipping $target_path because $source_path does not exist."
      continue
    fi

    if [ -e "$target_path" ] && [ ! -L "$target_path" ]; then
      warn "Skipping $target_path because it exists and is not a symlink."
      continue
    fi

    ln -sfn "$source_path" "$target_path"
  done

  hash -r 2>/dev/null || true
}

verify_command() {
  command_name="$1"
  label="$2"
  tmp_output="$(mktemp)"
  if "$command_name" --help >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    sed -n '1,40p' "$tmp_output"
  elif "$command_name" >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    sed -n '1,40p' "$tmp_output"
  else
    cat "$tmp_output" >&2
    rm -f "$tmp_output"
    die "Global $command_name command did not print help output after npm link."
  fi
  rm -f "$tmp_output"
  log "Verified $label $command_name"
}

verify_available_command() {
  command_name="$1"
  label="$2"
  fallback_path="$3"

  if command -v "$command_name" >/dev/null 2>&1; then
    verify_command "$command_name" "$label"
  elif [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
    verify_command "$fallback_path" "direct $label"
  else
    die "Global $command_name command was not available after npm link."
  fi
}

verify_compat_command() {
  command_name="$1"
  fallback_path="$2"
  tmp_output="$(mktemp)"
  if command -v "$command_name" >/dev/null 2>&1 && "$command_name" --help >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    log "Verified compatibility alias $command_name"
  elif [ -n "$fallback_path" ] && [ -e "$fallback_path" ] && "$fallback_path" --help >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    log "Verified direct compatibility alias $fallback_path"
  else
    log "Compatibility alias $command_name was not available"
  fi
  rm -f "$tmp_output"
}

path_contains_dir() {
  dir="$1"
  case ":$PATH:" in
    *":$dir:"*) return 0 ;;
    *) return 1 ;;
  esac
}

verify_cli() {
  log "Verifying axis command"
  npm_bin="$(npm prefix -g)/bin"
  local_bin="$HOME/.local/bin"

  if ! command -v axis >/dev/null 2>&1; then
    warn "axis is installed at $npm_bin/axis but is not discoverable in PATH."
    if ! path_contains_dir "$local_bin"; then
      warn "Add $local_bin to PATH, then open a new shell or run: export PATH=\"$local_bin:\$PATH\""
    fi
  fi

  verify_available_command axis "primary command" "$npm_bin/axis"
  verify_available_command axis-tools "primary alias" "$npm_bin/axis-tools"

}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm

  if [ ! -e "$AXIS_TOOLS_DIR" ]; then
    clone_repo
  else
    update_repo
  fi

  install_cli
  verify_cli
  log "Installed Axis Tools from $AXIS_TOOLS_DIR"
}

main "$@"
