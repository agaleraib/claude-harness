#!/usr/bin/env bash
# acceptance-strictness.sh — deterministic acceptance-criteria strictness scanner.
#
# SINGLE SOURCE OF TRUTH for the strict-acceptance grammar (SCOPE rule +
# closed judgment lexicon + mechanism regexes M1–M4 + binding rule). The
# spec-planner self-check MIRRORS this grammar in prose; the review-focus
# helper and the fixtures CALL this scanner. There is no second copy of the
# regexes anywhere.
#
# Grammar reference: docs/specs/2026-07-02-spec-planner-strict-acceptance.md
#   §"The strict acceptance-criterion grammar", clauses (a)–(d).
#
# Engine + locale are pinned: every match runs under `LC_ALL=C grep -E`
# (case-insensitive lexicon/M4 via `LC_ALL=C grep -Ei`). POSIX ERE only —
# bare `|` alternation (never `\|`), no `\b` (explicit delimiter class
# `(^|[^[:alnum:]_])`…`([^[:alnum:]_]|$)`), ASCII-only comparators.
#
# Output contract:
#   stdout line 1 : "strict=<P> total=<T>"
#   then          : zero or more "sub-strict: <unbound-judgment|no-mechanism> :: <bullet>"
# Exit code is 0 on a clean scan (this is a scanner, not a gate — there is no
# abort flag, no `abort-eligible`, no `egregious` concept). The ONE non-zero
# exit is a matcher RUNTIME error: if a matcher cannot run (grep exits >1) the
# scanner writes a stderr diagnostic and exits 3 instead of silently reporting a
# non-match. Failing OPEN — reporting a bullet strict because a matcher never
# ran — is the worst mode for an enforcement tool, so it is explicitly refused.
# Matching is temp-free: NO bash here-strings, which write a temp file and fail
# in read-only/restricted environments; pipes (kernel buffers) are used instead.
#
# Bash 3.2 compatible (macOS default shell).
set -u

SPEC="${1:-}"

# (b) JUDGMENT-WORD LEXICON — closed, whole-token, delimiter-bounded.
#     Run case-insensitively via `LC_ALL=C grep -Ei`.
LEXICON='(^|[^[:alnum:]_])(clean|cleanly|fast|quick|quickly|intuitive|intuitively|smooth|smoothly|robust|robustly|graceful|gracefully|proper|properly|correct|correctly|seamless|seamlessly|user-friendly|performant|reliable|reliably|scalable|nice|snappy|responsive)([^[:alnum:]_]|$)'

# (c) MECHANISM REGEXES — a bullet "names a mechanism" iff >=1 of M1–M4 matches.
#     M1 has a binding rule for judgment bullets (see below).
M1_ANY='`[^`]+`'                # any backtick-fenced span (non-judgment bullets)
M1_CMD='`[^`]*[-/=(][^`]*`'     # command-shaped span (judgment bullets): inner text has - / = or (
M2='(^|[^[:alnum:]_])(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[[:space:]]+/'
M3='(<=|>=|==|<|>)[[:space:]]*[0-9]'
M4='(Error case|Edge case):'

# SCOPE-rule regexes (clause a).
BLOCK_OPEN='^[[:space:]]*\*\*Acceptance criteria'   # block opens on this marker
HEAD_CLOSE='^#{2,6}[[:space:]]'                     # any ##–###### ATX heading closes it
BULLET='^[[:space:]]*- \[ \][[:space:]]'            # an acceptance-criteria checkbox bullet

strict=0
total=0
sub_lines=()

# matches <regex> <line> [-i]
#   Temp-free ERE matcher. It NEVER uses a bash here-string: a here-string
#   writes the input to a temp file, and in a read-only/restricted
#   environment that write fails, the redirection returns non-zero BEFORE grep
#   runs, and the caller reads the result as "no match" — the scanner then fails
#   OPEN (a scoped bullet is silently misclassified as strict). A pipe uses a
#   kernel pipe buffer, never touches disk, and cannot fail that way.
#   Returns 0 on a match, 1 on a genuine NON-match. On a matcher RUNTIME error
#   (grep exits >1 — e.g. the regex engine could not run) it does NOT report a
#   non-match: it writes a diagnostic to stderr and aborts the whole scan
#   (exit 3), so a matcher that never ran can never be silently reported strict.
#   LC_ALL=C keeps the ERE dialect + locale pinned to the grammar.
matches() {
  local re="$1" line="$2" flag="${3:-}" rc
  if [[ "$flag" == "-i" ]]; then
    printf '%s\n' "$line" | LC_ALL=C grep -Eiq -e "$re"
  else
    printf '%s\n' "$line" | LC_ALL=C grep -Eq -e "$re"
  fi
  rc=$?
  if [[ $rc -gt 1 ]]; then
    printf 'acceptance-strictness: matcher error (grep exit %d) on line: %s\n' "$rc" "$line" >&2
    exit 3
  fi
  return $rc
}

in_block=0
while IFS= read -r line || [[ -n "$line" ]]; do
  # (a) SCOPE: track the OPEN acceptance-criteria block.
  if matches "$BLOCK_OPEN" "$line"; then
    in_block=1
    continue                                        # the marker line is never a bullet
  fi
  if [[ $in_block -eq 1 ]] && matches "$HEAD_CLOSE" "$line"; then
    in_block=0                                       # heading closes the block
  fi
  [[ $in_block -eq 1 ]] || continue
  matches "$BULLET" "$line" || continue

  total=$((total + 1))
  # Emit the bullet left-trimmed of leading whitespace (matches the contract's
  # `sub-strict: <reason> :: - [ ] <text>` shape).
  bullet="${line#"${line%%[![:space:]]*}"}"

  is_judgment=0
  matches "$LEXICON" "$line" -i && is_judgment=1

  mech=0
  matches "$M2" "$line"    && mech=1
  matches "$M3" "$line"    && mech=1
  matches "$M4" "$line" -i && mech=1
  # M1 binding rule: for a judgment bullet, only a COMMAND-SHAPED span binds;
  # for a non-judgment bullet, any backtick span binds.
  if [[ $is_judgment -eq 1 ]]; then
    matches "$M1_CMD" "$line" && mech=1
  else
    matches "$M1_ANY" "$line" && mech=1
  fi

  # (d) BINDING + STRICTNESS.
  if [[ $mech -eq 1 ]]; then
    strict=$((strict + 1))
  elif [[ $is_judgment -eq 1 ]]; then
    sub_lines+=("sub-strict: unbound-judgment :: $bullet")
  else
    sub_lines+=("sub-strict: no-mechanism :: $bullet")
  fi
done < <(cat -- "$SPEC" 2>/dev/null)

printf 'strict=%d total=%d\n' "$strict" "$total"
if [[ ${#sub_lines[@]} -gt 0 ]]; then
  for l in "${sub_lines[@]}"; do
    printf '%s\n' "$l"
  done
fi
exit 0
