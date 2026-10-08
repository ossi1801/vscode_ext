# Single-VSIX implementation — 2026-10-08

The deliverable is `merlin-0.3.0-linux-x64.vsix`. It includes Electron 44.7.0,
the X11 native window adapter, the eSpeak NG 1.52.0 engine and dictionaries,
shared renderer, sprites, licenses and synthesizer source. No separate runtime
installation, executable configuration, terminal tools, Python, speech service,
network download or manually entered native window ID is required.

The extension activates on startup and queries its focused native Code window
using the included helper. That window's ID and PID are tracked for the session.
Its internal overlay process communicates through authenticated inherited pipes,
with bounded messages, generations, utterance IDs and heartbeat expiry.

## Observed validation

Target: Debian 13 Linux x64, GNOME Shell 48.7, Wayland session with XWayland.

- The native fixture passed click-through for both wizard and bubble, foreground
  switching, move/resize, focus hide/show, minimize/restore and disconnect cleanup.
- Bundled eSpeak synthesis followed by WebAudio playback reached the renderer's
  actual audio-source completion callback. No Speech Dispatcher or Python was
  used. Human listening was not available to assess loudness or voice quality.
- Native tests run with the overlay process PATH set to a nonexistent directory
  to check that no xprop, xwininfo, Python, or speech command is needed at runtime.
- Unit tests cover automatic window binding without prompts, executable paths
  inside the installed extension, explicit stop behavior, schema validation,
  native geometry/DPI, per-window ownership, synthesis replacement/cancellation,
  and diagnostics with no sidebar, plus existing cooldown/animation behavior.
- The bundled synthesizer is built without Sonic, pcaudio or MBROLA support. It
  depends only on standard C/C++ runtime libraries; Electron and the tracking
  helper also use the host desktop graphics/audio libraries.

## Remaining platform limits

The fixture deliberately marks its own test window as Code class; it is not a
real VS Code window. Actual VS Code variant/session binding, editor typing and
selection, language-server delivery, modal/full-screen stacking, mixed-DPI and
multi-monitor behavior, accessibility, and clean VS Code-profile installation
remain to be checked before publishing a release. This artifact is a local
experimental build, not a signed or published release.

Native Wayland Code windows remain unsupported by the X11 adapter. Running Code
under X11/XWayland enables the implemented tracking path. The sidebar and bundled
voice remain available when overlay tracking is unavailable. The local artifact declares Linux x64; the cross-platform build workflow below
produces separate platform artifacts.
The native binaries were built on Debian 13; older Linux runtimes are unverified.

Electron's platform notices explain the Wayland positioning restrictions:
https://www.electronjs.org/docs/latest/api/browser-window/#platform-notices

## Cross-platform implementation — 2026-10-08

The overlay now selects bundled native adapters on Linux, macOS and Windows.
macOS uses CoreGraphics window IDs/bounds and NSWorkspace foreground process
identity; Windows uses HWNDs, foreground/minimized/cloaked state and executable
identity. No scripts, terminal tools or additional installers run on user systems.
macOS bounds remain in points; Windows uses Electron screenToDipRect for DPI.
The existing renderer and click-through overlay are shared across platforms.
The build workflow produces OS/CPU-specific VSIX files with native speech engines
and Electron, rather than trying to run Linux binaries on another OS.

Earlier Linux fixture results above refer to the prior build. Cross-platform
startup and DPI unit tests pass locally; macOS/Windows native compilation and
real desktop acceptance remain unverified until their runners/desktops are used.

Validation of this revision: Linux native fixture passed bundled audio completion,
wizard and bubble click-through, app switching, move/resize, focus changes,
minimize/restore and disconnect. Windows tracking helper cross-compiles with
MinGW-w64; its imports are only dwmapi, KERNEL32, msvcrt and USER32. The macOS
helper and the Windows speech/runtime package still require native runner builds.

## Default editor overlay — version 0.4.0

The user's Flatpak VS Code failed before overlay startup: its extension host has
an empty DISPLAY, so XOpenDisplay cannot connect. The prior X11 native fixture
never established compatibility with that environment.

The default `overlay` mode now uses editor decorations and existing sprite
assets inside VS Code's renderer. The native implementation is opt-in as
`desktop`; the portable VSIX excludes Electron and all native executables.
Default activation also avoids initializing the native voice engine. Editor
speech bubbles are text-only. Optional native packages retain audible speech.

Actual Flatpak VS Code 1.137.0 validation passed with DISPLAY empty: visible
sprite and speech bubble over code, absolute positioning, zero horizontal text
space, pointer hit-testing to the code underneath, insertion through the sprite,
and dragging through it to select code. The screenshot and machine-readable
results live under `.test-artifacts` (not shipped). These results were obtained
in an isolated extension development window of the installed Flatpak app.

Absolute positioning via decoration CSS is undocumented. This implementation
must be rechecked after VS Code renderer changes. The API does not provide a
supported arbitrary overlay surface over editor text. VS Code Pets itself uses
createWebviewPanel or a WebviewView; copying that approach would confine Merlin
to a panel, contrary to the over-code requirement.

## Immediate roaming — version 0.4.1

Editor mode now starts in the moving state and returns to moving after magic,
speech expiry, dismissal and focus changes. Occasional magic interrupts roaming
for its animation duration rather than leaving the character idle. Default speed
is 48 px/s; vertical positioning now includes the sub-line pixel offset.

The packaged 0.4.1 files passed the Flatpak VS Code 1.137.0 renderer test with
DISPLAY empty. Over 1.5 seconds the sprite moved from (248,442) to (176,466),
with no movement command. Clicking/typing and dragging through the sprite still
edited/selected the actual code. Unit checks also verify immediate movement,
pause/resume, and return to moving after magic.
