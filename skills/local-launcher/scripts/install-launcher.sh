#!/bin/zsh
# Build ~/Applications/<APP_NAME>.app — the Dock icon.
#
# It boots the dev servers, then opens the window: the Chrome shortcut app when
# one exists (so the window gets its own Dock tile and Cmd+Tab entry), and the
# default browser otherwise. A plain script bundle — no compilation, no signing.
#
# The bundle sets LSUIElement, so it never takes a Dock slot of its own while it
# runs. Pin THIS, not the Chrome shortcut app: Chrome's bundle opens a window
# but starts nothing.
#
#   ./install-launcher.sh            # install or refresh
#   ./install-launcher.sh --dock     # ...and pin it to the Dock
#
# Config: launcher.conf next to this script.
set -e

HERE="${0:A:h}"
[ -f "$HERE/launcher.conf" ] || { print -u2 "launcher.conf not found next to this script"; exit 1; }
source "$HERE/launcher.conf"

APP="$HOME/Applications/$APP_NAME.app"

[ -f "$HERE/AppIcon.icns" ] || { print -u2 "AppIcon.icns missing — run: python3 make-icon.py"; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/MacOS/launcher" <<SH
#!/bin/zsh
"$HERE/boot-servers.sh" || exit 1
# Prefer the Chrome shortcut app: same profile (so extensions work) but its own
# bundle id, which is what earns the window a separate Dock and Cmd+Tab entry.
CHROME_APP="\$HOME/Applications/Chrome Apps.localized/$APP_NAME.app"
if [ -d "\$CHROME_APP" ]; then
  open -a "\$CHROME_APP"
else
  open "$OPEN_URL"
fi
SH
chmod +x "$APP/Contents/MacOS/launcher"
cp "$HERE/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>local.launcher.$(print "$APP_NAME" | tr '[:upper:] ' '[:lower:]-')</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- Launcher only: it starts servers and opens a browser, so it should never
       take a Dock slot of its own while running. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" >/dev/null 2>&1 || true

print "installed $APP"

if [ "$1" = "--dock" ]; then
  python3 - "$APP" <<'PY'
import plistlib, subprocess, sys

app = sys.argv[1]
raw = subprocess.run(["defaults", "export", "com.apple.dock", "-"],
                     capture_output=True, check=True).stdout
pl = plistlib.loads(raw)
apps = pl.get("persistent-apps", [])

def url(entry):
    return entry.get("tile-data", {}).get("file-data", {}).get("_CFURLString", "")

# Drop any stale entry first so repeated runs do not stack duplicates.
kept = [a for a in apps if app not in url(a)]
kept.append({"tile-data": {"file-data": {"_CFURLString": app, "_CFURLStringType": 0}}})
pl["persistent-apps"] = kept
subprocess.run(["defaults", "import", "com.apple.dock", "-"],
               input=plistlib.dumps(pl), check=True)
PY
  # The Dock rewrites its plist from memory when it quits, so restart it only
  # after the write above has landed.
  killall Dock
  print "pinned to the Dock"
fi
