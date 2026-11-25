# AGENTS.md

Guidance for AI coding agents working on this repository.

## What this is

A GNOME Shell extension (pure GJS, no build step) that shows the current
sprint in the top bar. Source files are installed as-is by `./install.sh`;
there is nothing to compile except the GSettings schema, which the script
handles via `glib-compile-schemas`.

## Critical: two different resource import paths

GNOME 49 split the JS resources between the shell process and the
extension-prefs process, so `extension.js` and `prefs.js` must import from
**different** URIs:

| File | Import path | Works in |
|---|---|---|
| `extension.js` | `resource:///org/gnome/shell/extensions/extension.js` (lowercase `shell`) | Shell process, GNOME 45+ |
| `prefs.js` | `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` (capital `Shell`) | Prefs process, GNOME 49+ only |

Do not "fix" these to match each other. Using the old path in `prefs.js`
produces an `ImportError: … does not exist` and the settings dialog never
opens (this shipped once; see commit f088d77).

The prefs path means the settings dialog requires GNOME 49+, even though
`metadata.json` declares 45+ for the indicator itself.

## Reference material on this machine

Working examples for the current GNOME version live in
`/usr/share/gnome-shell/extensions/*/` — when an import, widget, or API
isn't working, check how those extensions do it before searching the web.

## Workflow

- After editing: run `./install.sh`, then the user must **log out and back
  in** (Wayland — no in-place shell restart) to load new code. The prefs
  dialog, however, is a separate process and picks up changes immediately.
- Syntax-check JS without a shell restart:
  `cp file.js /tmp/x.mjs && node --check /tmp/x.mjs`
- Runtime errors: `journalctl -f /usr/bin/gnome-shell`.
- Settings can be read/written without the dialog:
  `gsettings --schemadir ~/.local/share/gnome-shell/extensions/sprint-indicator@micho/schemas org.gnome.shell.extensions.sprint-indicator <key> <value>`
  (note: `--schemadir` goes **before** the verb).
- Test the prefs dialog from a terminal: `gnome-extensions prefs
  sprint-indicator@micho` — errors print to stderr.

## Conventions

- Sprint math is local-midnight date arithmetic; DST is handled by
  rounding day differences (see `computeSprintInfo` in `extension.js`).
  Keep it that way — no timestamps, no UTC.
- The progress bar is a Cairo-drawn `St.DrawingArea` (`SprintProgressBar`);
  size/colors are the `BAR_*` constants at the top of `extension.js`.
- UI strings are plain English, no gettext.
