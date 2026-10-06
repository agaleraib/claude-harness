#!/bin/bash
# Tests for dispatch.sh against throwaway repos. Usage: bash scripts/git-hooks/test.sh
# Isolated from the machine's git config: HOME and GIT_CONFIG_GLOBAL point at a temp dir.
set -u
DISPATCH=$(cd "$(dirname "$0")" && pwd)/dispatch.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export HOME="$T/home" GIT_CONFIG_GLOBAL="$T/gitconfig" GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME/.git-hooks"
for n in pre-commit pre-push post-commit commit-msg; do ln -s "$DISPATCH" "$HOME/.git-hooks/$n"; done
git config --global core.hooksPath "$HOME/.git-hooks"
git config --global user.name t; git config --global user.email t@t
git config --global init.defaultBranch main

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
expect() { # expect <0|1> <name> <cmd...>
  local want=$1 name=$2; shift 2
  if "$@" >"$T/out" 2>&1; then got=0; else got=1; fi
  [ "$got" = "$want" ] && ok "$name" || { bad "$name (exit $got, want $want)"; sed 's/^/       /' "$T/out"; }
}

new_repo() { # new_repo <name> -> cd into a repo with a bare origin and one pushed commit
  git init -q --bare "$T/$1.git"
  git init -q "$T/$1"; cd "$T/$1" || exit 1
  git remote add origin "$T/$1.git"
  echo a > a.txt; git add a.txt; git commit -qm init; git push -q origin main 2>/dev/null
}

echo "pre-commit secrets"
new_repo secrets
echo 'x = 1' > clean.ts; git add clean.ts
expect 0 "clean staged change commits" git commit -qm clean
printf 'k = "%s%s"\n' "sk-ant-" "abcdefghijklmnopqrstuvwx" > leak.ts; git add leak.ts
expect 1 "added secret line blocks commit" git commit -qm leak
printf 'k = "%s%s" // harness-allow-secret\n' "sk-ant-" "abcdefghijklmnopqrstuvwx" > leak.ts; git add leak.ts
expect 0 "allow marker lets fixture through" git commit -qm fixture
printf 'k = "%s%s"\n' "AKIA" "ABCDEFGHIJKLMNOP" > aws.ts; git add aws.ts
expect 0 "HARNESS_HOOKS=off skips checks" env HARNESS_HOOKS=off git commit -qm off

echo "pre-push gate"
new_repo gate
cat > .harness-profile <<'EOF'
quality_bar:
  typecheck_blocking: true
  test_required: false
gate:
  typecheck: "test -f typecheck-ok"   # comment after value
  tests: "false"
EOF
git add .harness-profile; git commit -qm profile
expect 1 "failing gate.typecheck blocks push" git push -q origin main
touch typecheck-ok
expect 0 "passing typecheck pushes; tests skipped (test_required false)" git push -q origin main
sed -i.bak 's/test_required: false/test_required: true/' .harness-profile && rm .harness-profile.bak
git commit -qam tests-on
expect 1 "gate.tests runs when test_required true" git push -q origin main
printf 'quality_bar:\n  typecheck_blocking: false\ngate:\n  typecheck: "false"\n  verify: ["sh", "-c", "exit 0"]\n' > .harness-profile
git commit -qam tc-off
expect 0 "typecheck_blocking false skips typecheck; list-form verify runs" git push -q origin main
printf 'gate:\n  verify: ["sh", "-c", "exit 3"]\n' > .harness-profile
git commit -qam verify-fail
expect 1 "failing list-form verify blocks push" git push -q origin main
printf 'quality_gate:\n  command: "false"\n' > .harness-profile
git commit -qam legacy
expect 1 "legacy quality_gate.command used when no gate block" git push -q origin main
printf 'harness_hooks: off\nquality_gate:\n  command: "false"\n' > .harness-profile
git commit -qam optout
expect 0 "harness_hooks: off skips the gate" git push -q origin main

echo "pre-push mass deletion"
new_repo del
for i in $(seq 1 12); do echo $i > f$i.txt; done; git add f*.txt; git commit -qm files; git push -q origin main
git rm -q f*.txt; git commit -qm delete
expect 1 "deleting 12 files blocks push" git push -q origin main
expect 0 "ALLOW_MASS_DELETE=1 overrides" env ALLOW_MASS_DELETE=1 git push -q origin main
git checkout -q -b feature
expect 0 "new branch push with no deletions passes" git push -q origin feature

echo "chaining"
new_repo chain
mkdir -p scripts/hooks
printf '#!/bin/sh\necho repo-hook >> "%s/chain.log"\n' "$T" > scripts/hooks/post-commit; chmod +x scripts/hooks/post-commit
printf '#!/bin/sh\necho legacy-hook >> "%s/chain.log"\n' "$T" > .git/hooks/post-commit; chmod +x .git/hooks/post-commit
git add scripts; git commit -qm chain
grep -q repo-hook "$T/chain.log" && ok "scripts/hooks/<name> chained" || bad "scripts/hooks/<name> chained"
grep -q legacy-hook "$T/chain.log" && ok ".git/hooks/<name> chained" || bad ".git/hooks/<name> chained"
mkdir -p "$HOME/.git-hooks/local"
printf '#!/bin/sh\necho local-hook >> "%s/chain.log"\n' "$T" > "$HOME/.git-hooks/local/post-commit"; chmod +x "$HOME/.git-hooks/local/post-commit"
git commit -q --allow-empty -m local
grep -q local-hook "$T/chain.log" && ok "<hooks-dir>/local/<name> chained" || bad "<hooks-dir>/local/<name> chained"
printf '#!/bin/sh\nexit 1\n' > .git/hooks/commit-msg; chmod +x .git/hooks/commit-msg
echo b > b.txt; git add b.txt
expect 1 "chained hook failure propagates" git commit -qm fail
rm .git/hooks/commit-msg
ln -s "$DISPATCH" .git/hooks/commit-msg
expect 0 "repo hook symlinked to dispatcher does not loop" git commit -qm self
printf '#!/bin/sh\nwhile read l r rr rs; do echo "$r" >> "%s/stdin.log"; done\n' "$T" > .git/hooks/pre-push; chmod +x .git/hooks/pre-push
git push -q origin main 2>/dev/null
[ -s "$T/stdin.log" ] && ok "pre-push stdin replayed to chained hook" || bad "pre-push stdin replayed to chained hook"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
