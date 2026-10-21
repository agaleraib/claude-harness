#!/bin/zsh
# Start the project's dev servers if they are not already listening, then return.
#
# Opens no window. Called by the Chrome shortcut app's loader wrapper (so the
# Dock has a single icon that both boots and browses) and by the standalone
# launcher. Safe to run repeatedly — it never starts a second copy.
#
# Config: launcher.conf next to this script.

# LaunchServices can start a bundle under Rosetta (x86_64). Native modules under
# node_modules are arm64, so re-exec natively before touching them, or the dev
# server dies with "Cannot find module ...darwin-x64.node".
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && [ "$(uname -m)" != "arm64" ]; then
  exec arch -arm64 "$0" "$@"
fi

HERE="${0:A:h}"
[ -f "$HERE/launcher.conf" ] || {
  osascript -e "display alert \"Launcher\" message \"launcher.conf not found next to boot-servers.sh\"" >/dev/null 2>&1
  exit 1
}
source "$HERE/launcher.conf"

# A GUI process inherits almost no PATH. Spell it out or `bun`/`node` vanish.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.bun/bin:$HOME/.local/bin"

: "${LOG_FILE:=$HOME/Library/Logs/${APP_NAME}-dev.log}"

notify() { osascript -e "display notification \"$1\" with title \"$APP_NAME\"" >/dev/null 2>&1; }
alert()  { osascript -e "display alert \"$APP_NAME\" message \"$1\"" >/dev/null 2>&1; }
port_up() { lsof -ti :"$1" >/dev/null 2>&1; }

wait_for_port() {
  local port=$1 tries=${2:-60} i=0
  while [ $i -lt "$tries" ]; do
    port_up "$port" && return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

[ -d "$PROJECT_DIR" ] || { alert "Project not found at $PROJECT_DIR"; exit 1; }

# Fast path: everything already listening. This is the common case on a second
# click, and it must stay cheap — the window is waiting on us.
all_up=1
for svc in "${SERVICES[@]}"; do
  port_up "${svc%%:*}" || { all_up=0; break; }
done
[ "$all_up" = 1 ] && exit 0

mkdir -p "$(dirname "$LOG_FILE")"
print -r -- "\n===== $(date) — $APP_NAME boot =====" >> "$LOG_FILE"

started=0
for svc in "${SERVICES[@]}"; do
  port="${svc%%:*}"
  rest="${svc#*:}"
  dir="${rest%%:*}"
  cmd="${rest#*:}"

  port_up "$port" && continue

  workdir="$PROJECT_DIR/$dir"
  [ -d "$workdir" ] || { alert "Service directory not found: $workdir"; exit 1; }

  if [ -n "$INSTALL_CMD" ] && [ -n "$INSTALL_MARKER" ] && [ ! -e "$workdir/$INSTALL_MARKER" ]; then
    notify "Installing dependencies in $dir…"
    print -r -- "--- $INSTALL_CMD in $dir" >> "$LOG_FILE"
    (cd "$workdir" && eval "$INSTALL_CMD" >> "$LOG_FILE" 2>&1)
  fi

  print -r -- "--- starting $dir on :$port" >> "$LOG_FILE"
  # Run the command through `zsh -c` rather than handing it to nohup directly:
  # a command may legitimately start with an environment assignment
  # (`PORT=3099 bun run …`), and nohup would try to exec that as a program name.
  # Double-fork so the server outlives this script and the bundle that called
  # it. This is a launcher, not a supervisor.
  (cd "$workdir" && nohup zsh -c "$cmd" >> "$LOG_FILE" 2>&1 &) &
  started=1
done

[ "$started" = 1 ] && notify "Starting the dev servers…"

: "${PRIMARY_PORT:=${SERVICES[1]%%:*}}"
wait_for_port "$PRIMARY_PORT" 60 || {
  alert "Nothing came up on :$PRIMARY_PORT within 60s. Log: $LOG_FILE"
  exit 1
}

# Secondary services get a grace period but never block the window.
for svc in "${SERVICES[@]}"; do
  port="${svc%%:*}"
  [ "$port" = "$PRIMARY_PORT" ] && continue
  wait_for_port "$port" 20 || print -r -- "--- warning: :$port did not come up" >> "$LOG_FILE"
done
