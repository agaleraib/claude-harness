# macOS app bundles for local dev launchers — the parts that bite

Reference for `local-launcher`. Read it when something does not behave, or
before adapting the scripts to a different browser or window strategy.

## Why a Chrome shortcut app, not a copied browser

The goal is a window with its own Dock tile and its own Cmd+Tab entry, not a tab
inside the browser you already have open. macOS groups both by **bundle
identifier**, so a second window, a second profile, or a `--app=URL` invocation
all still read as the same application. The identity has to change.

Three ways to get a distinct bundle id, and what each costs:

| Approach | Size | Extensions | Survives browser update |
|---|---|---|---|
| Chrome shortcut app (`Install page as app`) | ~2 MB | yes — runs in the normal profile | yes, Chrome maintains it |
| Copied browser bundle with a rewritten id | 0.5–1.4 GB | only if re-installed in a fresh profile | no — recopy each update |
| `--app=URL` on the normal browser | 0 | yes | n/a — but no separate entry, so it fails the goal |

The Chrome shortcut app wins on every axis that matters. A copied browser is
only worth it when you specifically want an isolated profile, or when the
browser has no shortcut-app feature.

## You cannot hand-build a Chrome shortcut app

The obvious shortcut — copy an existing `Chrome Apps.localized/*.app`, rewrite
`CrAppModeShortcutID`, `CrAppModeShortcutURL` and the bundle id — **does not
work**. `app_mode_loader` resolves the shortcut id against the registry inside
the Chrome profile. When the id is absent it does not error: it silently falls
back to opening plain Chrome, which looks like the launcher "sort of working"
while giving you no separate entry at all.

The bundle has to be minted by Chrome itself:

**⋮ → Cast, Save and Share → Install page as app…**

That one step cannot be automated. Budget for a manual step in any onboarding
doc that uses this pattern.

Chrome names the bundle after the page `<title>` at install time, so a page
titled `MyApp — Some Long Subtitle` yields exactly that bundle name. Set a short
`<title>` before installing — renaming the bundle afterwards does not stick (see
below).

## Chrome repairs its shortcut bundles — do not modify them

The tempting move is to make one bundle do everything: replace
`Contents/MacOS/app_mode_loader` with a shell script that boots the dev servers
and then `exec`s the original binary, kept alongside as `app_mode_loader-real`.

It works. Once. Chrome then rewrites the bundle — restoring its own binary,
dropping `app_mode_loader-real`, replacing the icon, and re-adding the
`.lproj` directories — so the next click opens a window and starts nothing.
Observed against Chrome 151 with a bundle minted by Chrome 140: the repair fires
on launch, after the wrapper has already run, which is exactly what makes it
hard to spot. The first cold test passes.

Two consequences:

- **Keep the launcher in a separate bundle you own.** A tiny `LSUIElement`
  script bundle boots the servers and then `open -a`s the Chrome app. Chrome's
  bundle stays pristine, so there is nothing for it to revert.
- **Brand the app through the page, not the bundle.** Chrome derives the app
  name from `<title>` and the icon from the page's `apple-touch-icon` or web
  app manifest, and it regenerates both from the live page. An icon copied into
  `Contents/Resources/app.icns` is reverted; one served by the page survives.

If you modify a bundle anyway — for a copied browser, say — note that Chrome
signs ad-hoc with the `kill` and `restrict` flags:

```
CodeDirectory ... flags=0x10a02(adhoc,kill,restrict,runtime)
```

`kill` means the kernel terminates the process when the signature does not
validate, so a modified executable refuses to launch *silently*, with nothing
useful in Console. `codesign --force --deep --sign -` restores it. That gets the
bundle running; it does not stop Chrome from repairing it afterwards.

## GUI processes inherit almost no PATH

A bundle launched from the Dock does not source your shell profile. `bun`,
`node`, `pnpm` and friends are simply not found, and the failure surfaces as a
dev server that never comes up. Set PATH explicitly at the top of any script a
bundle calls:

```sh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.bun/bin"
```

## Rosetta re-exec

LaunchServices can start a bundle as x86_64 on Apple Silicon. Native modules
under `node_modules` are arm64, so the dev server dies with
`Cannot find module ...darwin-x64.node`. Re-exec natively first:

```sh
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && [ "$(uname -m)" != "arm64" ]; then
  exec arch -arm64 "$0" "$@"
fi
```

## Editing the Dock

`com.apple.dock` holds `persistent-apps` as an array of nested dicts. Two
traps:

- **The Dock rewrites its plist from memory when it quits.** Write first, then
  `killall Dock`. Restarting it before the write lands discards the change, and
  the symptom is a Dock that looks untouched.
- **`defaults write -array-add` cannot de-duplicate.** Re-running an installer
  stacks copies. Read the array, filter by path, append, write it back —
  `install-launcher.sh` does this with `plistlib`.

Chrome pins its shortcut app automatically at install time. Unpin it: it opens
a window but starts nothing, so leaving it gives the user two tiles and a
coin-flip on which one works. Pin the launcher bundle instead.

## LSUIElement

Set `LSUIElement` to true on a launcher that only starts things and opens a
URL. Without it the launcher itself claims a Dock tile and a Cmd+Tab slot for
the seconds it runs, which is exactly the clutter the pattern exists to avoid.
Do **not** set it on a bundle that owns the window — that would hide the thing
you want to switch to.
