#!/usr/bin/env bash
set -euo pipefail

ORBIT_TOOLS_DIR="${ORBIT_TOOLS_DIR:-$HOME/orbit-tools}"
ORBIT_TOOLS_REPO="${ORBIT_TOOLS_REPO:-https://github.com/togally/orbit-tools.git}"
ORBIT_TOOLS_BRANCH="${ORBIT_TOOLS_BRANCH:-main}"
ORBIT_TOOLS_FORCE="${ORBIT_TOOLS_FORCE:-0}"

log() {
  printf '[orbit-tools] %s\n' "$*"
}

die() {
  printf '[orbit-tools] ERROR: %s\n' "$*" >&2
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
  actual="$(git -C "$ORBIT_TOOLS_DIR" remote get-url origin 2>/dev/null || true)"
  if [ -z "$actual" ]; then
    return 1
  fi

  normalized_actual="$(normalize_repo_url "$actual")"
  normalized_expected="$(normalize_repo_url "$ORBIT_TOOLS_REPO")"
  [ "$normalized_actual" = "$normalized_expected" ]
}

has_local_changes() {
  ! git -C "$ORBIT_TOOLS_DIR" diff --quiet ||
    ! git -C "$ORBIT_TOOLS_DIR" diff --cached --quiet ||
    [ -n "$(git -C "$ORBIT_TOOLS_DIR" ls-files --others --exclude-standard)" ]
}

clone_repo() {
  parent_dir="$(dirname "$ORBIT_TOOLS_DIR")"
  mkdir -p "$parent_dir"
  log "Cloning $ORBIT_TOOLS_REPO into $ORBIT_TOOLS_DIR"
  git clone --branch "$ORBIT_TOOLS_BRANCH" "$ORBIT_TOOLS_REPO" "$ORBIT_TOOLS_DIR"
}

ensure_expected_repo() {
  if ! git -C "$ORBIT_TOOLS_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    die "$ORBIT_TOOLS_DIR already exists but is not a git repo. Move it aside or set ORBIT_TOOLS_DIR to another path."
  fi

  if ! remote_matches_expected_repo; then
    actual="$(git -C "$ORBIT_TOOLS_DIR" remote get-url origin 2>/dev/null || printf '<missing>')"
    die "$ORBIT_TOOLS_DIR is not the expected orbit-tools repo. origin is '$actual', expected '$ORBIT_TOOLS_REPO'."
  fi
}

ensure_branch() {
  current_branch="$(git -C "$ORBIT_TOOLS_DIR" rev-parse --abbrev-ref HEAD)"
  if [ "$current_branch" = "$ORBIT_TOOLS_BRANCH" ]; then
    return 0
  fi

  if [ "$ORBIT_TOOLS_FORCE" != "1" ]; then
    die "$ORBIT_TOOLS_DIR is on branch '$current_branch', expected '$ORBIT_TOOLS_BRANCH'. Check out the expected branch or rerun with ORBIT_TOOLS_FORCE=1."
  fi

  log "Checking out $ORBIT_TOOLS_BRANCH because ORBIT_TOOLS_FORCE=1"
  if git -C "$ORBIT_TOOLS_DIR" show-ref --verify --quiet "refs/heads/$ORBIT_TOOLS_BRANCH"; then
    git -C "$ORBIT_TOOLS_DIR" checkout "$ORBIT_TOOLS_BRANCH"
  else
    git -C "$ORBIT_TOOLS_DIR" checkout -B "$ORBIT_TOOLS_BRANCH" "origin/$ORBIT_TOOLS_BRANCH"
  fi
}

update_repo() {
  ensure_expected_repo
  log "Fetching origin/$ORBIT_TOOLS_BRANCH"
  git -C "$ORBIT_TOOLS_DIR" fetch origin "$ORBIT_TOOLS_BRANCH"

  ensure_branch

  if [ "$ORBIT_TOOLS_FORCE" = "1" ]; then
    log "Resetting to origin/$ORBIT_TOOLS_BRANCH because ORBIT_TOOLS_FORCE=1"
    git -C "$ORBIT_TOOLS_DIR" reset --hard "origin/$ORBIT_TOOLS_BRANCH"
    return 0
  fi

  if has_local_changes; then
    die "$ORBIT_TOOLS_DIR has local changes. Commit or stash them, then rerun. To discard them, rerun with ORBIT_TOOLS_FORCE=1."
  fi

  local_rev="$(git -C "$ORBIT_TOOLS_DIR" rev-parse HEAD)"
  remote_rev="$(git -C "$ORBIT_TOOLS_DIR" rev-parse "origin/$ORBIT_TOOLS_BRANCH")"
  base_rev="$(git -C "$ORBIT_TOOLS_DIR" merge-base HEAD "origin/$ORBIT_TOOLS_BRANCH")"

  if [ "$local_rev" = "$remote_rev" ]; then
    log "Repository is already up to date"
  elif [ "$local_rev" = "$base_rev" ]; then
    log "Pulling latest code"
    git -C "$ORBIT_TOOLS_DIR" pull --ff-only origin "$ORBIT_TOOLS_BRANCH"
  elif [ "$remote_rev" = "$base_rev" ]; then
    die "$ORBIT_TOOLS_DIR has local commits not on origin/$ORBIT_TOOLS_BRANCH. Push, rebase, or rerun with ORBIT_TOOLS_FORCE=1 to discard them."
  else
    die "$ORBIT_TOOLS_DIR has diverged from origin/$ORBIT_TOOLS_BRANCH. Resolve it manually or rerun with ORBIT_TOOLS_FORCE=1 to discard local history."
  fi
}

install_cli() {
  log "Installing npm dependencies"
  (cd "$ORBIT_TOOLS_DIR" && npm install)

  log "Building orbit-tools"
  (cd "$ORBIT_TOOLS_DIR" && npm run build)

  log "Linking global orbit-tools command"
  (cd "$ORBIT_TOOLS_DIR" && npm link)
}

verify_cli() {
  log "Verifying orbit-tools command"
  tmp_output="$(mktemp)"
  if orbit-tools --help >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    sed -n '1,40p' "$tmp_output"
  elif orbit-tools >"$tmp_output" 2>&1 && [ -s "$tmp_output" ]; then
    sed -n '1,40p' "$tmp_output"
  else
    cat "$tmp_output" >&2
    rm -f "$tmp_output"
    die "Global orbit-tools command did not print help output after npm link."
  fi
  rm -f "$tmp_output"
}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm

  if [ ! -e "$ORBIT_TOOLS_DIR" ]; then
    clone_repo
  else
    update_repo
  fi

  install_cli
  verify_cli
  log "Installed orbit-tools from $ORBIT_TOOLS_DIR"
}

main "$@"
