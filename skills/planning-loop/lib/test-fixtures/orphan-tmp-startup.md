# Fixture O — orphan .autoapply-tmp file at Step 1 pre-flight
# Driver places a stale `<spec>.autoapply-tmp` next to the synthetic spec
# BEFORE invoking the skill. Auto-apply Phase 1 must NEVER run; the orphan
# detector at Step 1 must abort the loop with a manual-resolve message.
#
# Expected: pre-flight aborts; auto-apply was not invoked; both spec and
# orphan tmp file remain on disk untouched (user resolves manually).

# This fixture has no Round 3 / Arbiter sections because Phase 1 must abort
# before reading the log. The driver harness places an orphan-tmp file and
# checks that the skill's pre-flight detection fires.
