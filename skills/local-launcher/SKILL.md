---
name: local-launcher
description: Give a project a one-click desktop launcher — a Dock icon that boots its dev servers and opens the UI in a window with its own Cmd+Tab entry. Use when a project's dev loop needs several servers started by hand, when a non-developer teammate needs to reach a local UI without a terminal, or when the user asks for a desktop icon, app icon, or shortcut for a local project. macOS only.
argument-hint: "[install|icon]"
---

# Local Launcher

Turns "start two servers in two terminals, then remember which port" into one
Dock icon. The window it opens has its own Dock tile and Cmd+Tab entry, so the
project is switchable like any other app rather than buried in a browser tab.

**macOS only.** The bundle mechanics are Apple-specific.

## When this earns its keep

- A project whose dev loop needs more than one server started by hand.
- A teammate who validates work but does not develop — they should not need a
  terminal to reach a local UI.
- Any project you return to weekly rather than daily, where the cost is
  remembering the incantation, not typing it.

Not worth it for a single-command project you run all day. `npm run dev` is
already a one-liner; wrapping it adds a bundle to maintain and buys nothing.

## The shape: two bundles, one Dock tile

| Bundle | Role | Who builds it |
|---|---|---|
| `~/Applications/<name>.app` | Boots the servers, then opens the window. **This is the Dock tile.** Sets `LSUIElement` so it never takes a slot of its own. | `install-launcher.sh` |
| `~/Applications/Chrome Apps.localized/<name>.app` | The window. Own bundle id, so its own Dock tile and Cmd+Tab entry. Runs in the normal Chrome profile, so extensions work inside it. | Chrome, from the page |

They are separate on purpose. **Do not try to merge them by wrapping Chrome's
`app_mode_loader` with a boot script** — it appears to work, then Chrome repairs
the bundle on the next launch and silently restores its own binary, icon and
localized names. The result is a launcher that works exactly once. See
`references/macos-app-bundles.md`.

If the user has no Chrome, skip the shortcut app: the launcher falls back to
opening the URL in the default browser. The window then has no Cmd+Tab entry of
its own, which is the whole cost of not using Chrome.

## What gets built

```
<project>/dev/launcher/
  launcher.conf          # ports, directories, commands, colours
  boot-servers.sh        # starts what is not already listening; opens nothing
  install-launcher.sh    # builds the Dock bundle
  make-icon.py           # generates AppIcon.icns
  AppIcon.icns           # generated
```

## Procedure

### Step 1 — Establish what has to start

Read the project's `package.json` scripts, `docker-compose.yml`, or dev docs.
For each service you need: **port**, **directory**, **command**.

Then verify by hand before writing any config. Start each service, curl its
port, and note which one the UI is actually served from — that is `PRIMARY_PORT`
and the one worth blocking on. Getting this from documentation alone is how
launchers ship broken; ports drift from what the README claims.

Watch for a dev-server port that differs from the documented default because of
a proxy config — a frontend dev server proxying `/api` to a backend is the
common shape, and only the frontend port belongs in `OPEN_URL`.

### Step 2 — Write the config

Copy `scripts/launcher.conf.example` to the project's `dev/launcher/launcher.conf`
and fill it in. Copy the other scripts alongside it unchanged.

Pull `ICON_*` from the app's own palette — a CSS custom-property block or a
Tailwind config — so the Dock icon matches the UI it opens. A launcher whose
icon looks unrelated to the app is a launcher people fail to recognise.

### Step 3 — Generate the icon

```bash
cd dev/launcher && python3 make-icon.py
```

Needs Pillow. Inspect the result before continuing — `sips -s format png
AppIcon.icns --out /tmp/icon.png -Z 256` and look at it. Check it reads at small
sizes; a mark that is legible at 512px and mud at 32px is a failed icon.

### Step 4 — Boot the servers and confirm the UI

```bash
./boot-servers.sh
```

Confirm the UI actually renders, not just that the port answers. This also has
to succeed before Chrome can install the page as an app — there has to be a
page.

### Step 5 — Mint the Chrome shortcut app

**Manual, and it cannot be scripted.** Ask the user to do it:

1. Open `$OPEN_URL` in Chrome
2. **⋮ → Cast, Save and Share → Install page as app…**
3. Accept

A hand-built bundle does not work — `app_mode_loader` resolves the shortcut id
against the Chrome profile's registry and silently falls back to opening plain
Chrome when it is missing. Do not spend time trying.

Chrome names the bundle after the page `<title>` and pins it to the Dock. Both
are worth fixing at the source rather than by editing the bundle, because
Chrome regenerates the bundle but honours the page:

- **Name** — set a short `<title>` before installing.
- **Icon** — give the page a proper `apple-touch-icon` / manifest icon. An icon
  copied into the bundle is reverted; one served by the page is not.

Skip this step entirely if the user does not use Chrome or declines.

### Step 6 — Build the Dock bundle

```bash
./install-launcher.sh --dock
```

It detects the Chrome shortcut app by name and opens it when present.

Then unpin Chrome's own tile — Chrome pinned its shortcut app at install time,
and leaving it gives the user two icons, one of which opens a window without
starting anything.

### Step 7 — Verify cold

The only test that means anything:

```bash
lsof -ti :<port> -ti :<port> | xargs kill    # kill every service
open -a "$HOME/Applications/<name>.app"
```

Wait, then confirm every port is listening again and the window shows the UI. A
launcher that only works when the servers are already up is not a launcher.

Run it **twice**. A launcher that works once and not again is the signature
failure of this pattern, and one run will not show it.

## Maintenance

Editing `boot-servers.sh` or `launcher.conf` needs no rebuild — both are read
from the repo at run time. Editing what the Dock bundle does requires re-running
`install-launcher.sh`.

Chrome may regenerate its shortcut app at any time. With this design that costs
nothing: the bundle is unmodified, so there is nothing to restore.

## Adding a hub page

When a project has scattered visual artifacts — static mockups, generated
reports, a deck — a dependency-free `hub.html` next to the scripts, opened over
`file://`, indexes them alongside the live UI. Give each entry a status tag
(live / static / mockup / missing) so the page distinguishes what runs from what
is only a design. Optional and orthogonal to the launcher; it earns its place
when "what does this project even look like" takes more than one answer.

## Gotchas

Full detail in `references/macos-app-bundles.md`. The ones that cost the most
time:

- **GUI processes inherit almost no PATH.** `bun` and `node` are not found when
  launched from the Dock. Set PATH explicitly in every script a bundle calls.
- **Never modify a Chrome shortcut bundle.** Chrome repairs it, silently.
- **`nohup` cannot take an environment-assignment prefix.** `nohup PORT=3000 bun
  run …` tries to exec `PORT=3000`. Route the command through `zsh -c`.
- **zsh aborts on an unmatched glob.** `rm -rf …/*.lproj` fails the second time.
  Use the `(N)` qualifier.
- **The Dock rewrites its plist from memory on quit.** Write, then `killall
  Dock` — never the reverse. And `defaults write -array-add` cannot
  de-duplicate: filter and rewrite the array instead.
- **Rosetta.** Re-exec under `arch -arm64` before touching `node_modules`.
