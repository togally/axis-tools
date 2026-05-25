#!/usr/bin/env bash
set -euo pipefail

AXIS_TOOLS_DIR="${AXIS_TOOLS_DIR:-${ORBIT_TOOLS_DIR:-$HOME/axis-tools}}"
AXIS_TOOLS_REPO="${AXIS_TOOLS_REPO:-${ORBIT_TOOLS_REPO:-https://github.com/togally/axis-tools.git}}"
AXIS_TOOLS_BRANCH="${AXIS_TOOLS_BRANCH:-${ORBIT_TOOLS_BRANCH:-main}}"
AXIS_TOOLS_FORCE="${AXIS_TOOLS_FORCE:-${ORBIT_TOOLS_FORCE:-0}}"
AXIS_TOOLS_VERIFY_COMPAT="${AXIS_TOOLS_VERIFY_COMPAT:-${ORBIT_TOOLS_VERIFY_COMPAT:-1}}"

log() {
  printf '[axis-tools] %s\n' "$*"
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

  log "Removing old global orbit-tools link if present"
  npm unlink -g orbit-tools >/dev/null 2>&1 || true

  log "Linking global axis command"
  (cd "$AXIS_TOOLS_DIR" && npm link --force)
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

verify_compat_command() {
  command_name="$1"
  tmp_output="$(mktemp)"
  if "$command_name" --help >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    log "Verified compatibility alias $command_name"
  else
    log "Compatibility alias $command_name was not available"
  fi
  rm -f "$tmp_output"
}

verify_cli() {
  log "Verifying axis command"
  verify_command axis "primary command"

  if axis-tools --help >/dev/null 2>&1; then
    log "Verified primary alias axis-tools"
  else
    die "Global axis-tools alias was not available after npm link."
  fi

  if [ "$AXIS_TOOLS_VERIFY_COMPAT" = "1" ]; then
    verify_compat_command orbit
    verify_compat_command orbit-tools
  fi
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
