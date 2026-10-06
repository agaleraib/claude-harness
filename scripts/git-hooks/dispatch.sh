#!/bin/bash
# claude-harness global git hook dispatcher.
#
# Installed by setup-harness (Step 6) as ~/.git-hooks/<hook-name> symlinks to this
# file, with `git config --global core.hooksPath ~/.git-hooks`. The hook name comes
# from $0. For every hook it:
#   1. runs the harness checks for that hook (pre-commit, pre-push only);
#   2. chains, in order: machine-wide extras in <hooks-dir>/local/<name> (e.g. the
#      Second Brain post-commit), then the repo's own hooks, which a global
#      hooksPath would otherwise disable: <repo>/scripts/hooks/<name>, then
#      <git-common-dir>/hooks/<name>.
#
# Harness checks:
#   pre-commit  secret patterns in ADDED lines of the staged diff. A line containing
#               `harness-allow-secret` is skipped (test fixtures).
#   pre-push    (a) blocks a push deleting more than 10 files
#                   (override: ALLOW_MASS_DELETE=1 git push ...);
#               (b) runs the repo's gate from .harness-profile:
#                   gate.typecheck  unless quality_bar.typecheck_blocking: false
#                   gate.tests      only if quality_bar.test_required: true
#                   gate.verify     always, when present
#                   no gate: block  -> quality_gate.command (legacy), else nothing.
#
# Opt out: `harness_hooks: off` in .harness-profile (repo) or HARNESS_HOOKS=off (one
# command). Chained repo hooks still run. Repos with their own core.hooksPath
# (e.g. husky) never reach this file.

HOOK=$(basename "$0")
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

TOP=$(git rev-parse --show-toplevel 2>/dev/null)
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -n "$COMMON" ] && COMMON=$(cd "$COMMON" && pwd)
PROFILE="$TOP/.harness-profile"

# Hooks that receive data on stdin: capture once, replay to every step.
STDIN_FILE=""
case "$HOOK" in
  pre-push|post-rewrite|pre-receive|post-receive)
    STDIN_FILE=$(mktemp)
    cat > "$STDIN_FILE"
    trap 'rm -f "$STDIN_FILE"' EXIT
    ;;
esac

# --- .harness-profile reader (zero-dep; top-level block -> key: value) ----------
# profile_get <block|-> <key>: prints the scalar value; "-" reads a top-level key.
# Quoted values keep '#'; a flow list ["a","b"] is printed as a shell-quoted command.
profile_get() {
  [ -f "$PROFILE" ] || return 0
  local raw
  raw=$(awk -v blk="$1" -v key="$2" '
    function emit(v) { print v; found = 1; exit }
    blk == "-" && $0 ~ "^" key ":" { sub("^" key ":[ \t]*", ""); emit($0) }
    blk != "-" && /^[^ \t#]/ { inblk = ($0 ~ "^" blk ":[ \t]*(#.*)?$") ; next }
    blk != "-" && inblk && $0 ~ "^[ \t]+" key ":" { sub("^[ \t]+" key ":[ \t]*", ""); emit($0) }
  ' "$PROFILE")
  case "$raw" in
    \"*) raw=${raw#\"}; printf '%s\n' "${raw%%\"*}" ;;
    \'*) raw=${raw#\'}; printf '%s\n' "${raw%%\'*}" ;;
    \[*) printf '%s\n' "$raw" | python3 -c 'import sys,json,shlex,re; s=re.sub(r"\s+#.*$","",sys.stdin.read().strip()); print(shlex.join(json.loads(s)))' 2>/dev/null ;;
    *) printf '%s\n' "$raw" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' ;;
  esac
}

harness_enabled() {
  [ "$HARNESS_HOOKS" = "off" ] && return 1
  [ "$(profile_get - harness_hooks)" = "off" ] && return 1
  return 0
}

# --- pre-commit: secrets in added lines ------------------------------------------
SECRET_RE='sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|Bearer [A-Za-z0-9._-]{20,}'

check_secrets() {
  local hits
  hits=$(git diff --cached -U0 --diff-filter=ACMR --no-color --no-ext-diff | awk -v re="$SECRET_RE" '
    /^\+\+\+ / { file = substr($0, 7); next }
    /^@@/ { split($3, a, ","); line = substr(a[1], 2) + 0; next }
    /^\+/ { l = substr($0, 2); if (l ~ re && l !~ /harness-allow-secret/) printf "  %s:%d: %s\n", file, line, substr(l, 1, 120); line++ }
  ')
  if [ -n "$hits" ]; then
    echo "harness pre-commit: possible secret in staged lines:" >&2
    echo "$hits" >&2
    echo "Unstage or redact it. For a deliberate test fixture, put 'harness-allow-secret' on the line." >&2
    return 1
  fi
}

# --- pre-push: mass deletion + profile gate --------------------------------------
ZERO=0000000000000000000000000000000000000000
LIMIT=10

check_push() {
  local remote=$1 pushing=0 base deleted
  local default
  default=$(git symbolic-ref -q --short "refs/remotes/$remote/HEAD" 2>/dev/null)
  [ -z "$default" ] && for b in main master; do
    git rev-parse -q --verify "refs/remotes/$remote/$b" >/dev/null && default="$remote/$b" && break
  done

  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -z "$local_sha" ] && continue
    [ "$local_sha" = "$ZERO" ] && continue   # branch deletion
    pushing=1
    if [ "$remote_sha" = "$ZERO" ]; then
      [ -n "$default" ] || continue
      base=$(git merge-base "$local_sha" "$default" 2>/dev/null) || continue
    else
      base=$remote_sha
      git cat-file -e "$base^{commit}" 2>/dev/null || continue   # remote tip not fetched
    fi
    deleted=$(git diff --diff-filter=D --name-only "$base" "$local_sha" | wc -l | tr -d ' ')
    if [ "$deleted" -gt "$LIMIT" ] && [ "$ALLOW_MASS_DELETE" != "1" ]; then
      echo "harness pre-push: $remote_ref would delete $deleted files (limit $LIMIT):" >&2
      git diff --diff-filter=D --name-only "$base" "$local_sha" | head -20 >&2
      echo "Verify this is intended, then re-run with ALLOW_MASS_DELETE=1." >&2
      return 1
    fi
  done < "$STDIN_FILE"

  [ "$pushing" = 1 ] || return 0
  run_gate
}

run_gate() {
  [ -f "$PROFILE" ] || return 0
  local checks=() tc tests verify legacy
  tc=$(profile_get gate typecheck)
  tests=$(profile_get gate tests)
  verify=$(profile_get gate verify)
  if [ -n "$tc$tests$verify" ]; then
    [ -n "$tc" ] && [ "$(profile_get quality_bar typecheck_blocking)" != "false" ] && checks+=("typecheck|$tc")
    [ -n "$tests" ] && [ "$(profile_get quality_bar test_required)" = "true" ] && checks+=("tests|$tests")
    [ -n "$verify" ] && checks+=("verify|$verify")
  else
    legacy=$(profile_get quality_gate command)
    [ -n "$legacy" ] && checks+=("quality_gate|$legacy")
  fi
  [ ${#checks[@]} -gt 0 ] || return 0

  # Fresh worktrees often lack node_modules; a frozen bun install is sub-second.
  if [ -f "$TOP/package.json" ] && [ ! -d "$TOP/node_modules" ] && { [ -f "$TOP/bun.lock" ] || [ -f "$TOP/bun.lockb" ]; }; then
    (cd "$TOP" && bun install --frozen-lockfile >/dev/null 2>&1)
  fi

  local c name cmd out
  out=$(mktemp)
  for c in "${checks[@]}"; do
    name=${c%%|*}; cmd=${c#*|}
    if ! (cd "$TOP" && sh -c "$cmd") >"$out" 2>&1; then
      echo "harness pre-push: gate '$name' failed: $cmd" >&2
      tail -20 "$out" >&2
      rm -f "$out"
      return 1
    fi
  done
  rm -f "$out"
}

# --- dispatch --------------------------------------------------------------------
if harness_enabled; then
  case "$HOOK" in
    pre-commit) check_secrets || exit 1 ;;
    pre-push)   check_push "$1" || exit 1 ;;
  esac
fi

realpath_of() { python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null; }
SELF_REAL=""
for h in "$(dirname "$0")/local/$HOOK" "$TOP/scripts/hooks/$HOOK" "$COMMON/hooks/$HOOK"; do
  [ -x "$h" ] || continue
  # Never chain back into this dispatcher (a repo hook symlinked to it).
  [ -z "$SELF_REAL" ] && SELF_REAL=$(realpath_of "$0")
  [ "$(realpath_of "$h")" = "$SELF_REAL" ] && continue
  if [ -n "$STDIN_FILE" ]; then
    "$h" "$@" < "$STDIN_FILE" || exit $?
  else
    "$h" "$@" || exit $?
  fi
done
exit 0
