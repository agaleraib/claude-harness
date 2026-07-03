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
# Exit code is ALWAYS 0 (this is a scanner, not a gate). There is no abort
# flag, no `abort-eligible`, no `egregious` concept.
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

in_block=0
while IFS= read -r line || [[ -n "$line" ]]; do
  # (a) SCOPE: track the OPEN acceptance-criteria block.
  if LC_ALL=C grep -Eq -e "$BLOCK_OPEN" <<< "$line"; then
    in_block=1
    continue                                        # the marker line is never a bullet
  fi
  if [[ $in_block -eq 1 ]] && LC_ALL=C grep -Eq -e "$HEAD_CLOSE" <<< "$line"; then
    in_block=0                                       # heading closes the block
  fi
  [[ $in_block -eq 1 ]] || continue
  LC_ALL=C grep -Eq -e "$BULLET" <<< "$line" || continue

  total=$((total + 1))
  # Emit the bullet left-trimmed of leading whitespace (matches the contract's
  # `sub-strict: <reason> :: - [ ] <text>` shape).
  bullet="${line#"${line%%[![:space:]]*}"}"

  is_judgment=0
  LC_ALL=C grep -Eiq -e "$LEXICON" <<< "$line" && is_judgment=1

  mech=0
  LC_ALL=C grep -Eq  -e "$M2" <<< "$line" && mech=1
  LC_ALL=C grep -Eq  -e "$M3" <<< "$line" && mech=1
  LC_ALL=C grep -Eiq -e "$M4" <<< "$line" && mech=1
  # M1 binding rule: for a judgment bullet, only a COMMAND-SHAPED span binds;
  # for a non-judgment bullet, any backtick span binds.
  if [[ $is_judgment -eq 1 ]]; then
    LC_ALL=C grep -Eq -e "$M1_CMD" <<< "$line" && mech=1
  else
    LC_ALL=C grep -Eq -e "$M1_ANY" <<< "$line" && mech=1
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
