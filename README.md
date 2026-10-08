# Merlin
<img width="963" height="403" alt="image" src="https://github.com/user-attachments/assets/817b0a0b-b1c8-4785-976f-de676014c0d8" />


Install **merlin-0.6.1.vsix** using **Extensions: Install from VSIX**, then open
a text editor. This VSIX needs no external runtime, X11 connection or additional installation.
Linux speech synthesis and its small audio player are included in the VSIX;
macOS and Windows use the speech engines included with the operating system. It uses VS Code's editor
renderer on Linux (including Flatpak/Wayland), macOS and Windows.

Merlin appears **over the actual code**, rests between actions and usually teleports
instead of walking. Switching files plays a disappear/appear transition at a new
position. Dialogue appears in an attached speech bubble. The
sprite occupies no horizontal text space and passes pointer events through,
so typing, clicking and selecting still work. It follows the active editor and
visible lines. No character panel needs to be opened.

This editor overlay uses absolute positioning in decoration CSS, an
**undocumented VS Code behavior**. It was visually and functionally verified in
Flatpak VS Code 1.137.0 with an empty `DISPLAY`, including clicking, typing and
dragging through the sprite. Future VS Code renderer changes may require an
update. macOS and Windows use the same JavaScript editor-rendering path;
separate desktop tests on those operating systems remain outstanding.

## Modes

| `merlin.displayMode` | Behavior |
| --- | --- |
| `overlay` (default) | Merlin over code, with speech bubbles and audible TTS; no native overlay window |
| `desktop` | Optional whole-window native overlay, with bundled speech in platform VSIX builds |
| `sidebar` | Optional webview character surface, like the panel approach in VS Code Pets |

Audible speech is enabled by default in the editor overlay. **Merlin: Test Voice**
plays a sample; **Mute / Unmute Voice** cancels or enables playback, and **Select
Voice** lists the available voices. Speech works without opening the sidebar.
Linux uses the bundled eSpeak NG engine and audio player through the normal
desktop PulseAudio/PipeWire audio connection, including Flatpak's audio socket.
The local VSIX includes Linux x64 speech binaries; Linux ARM64 speech binaries
are produced by the ARM64 build workflow. macOS uses `/usr/bin/say`; Windows
uses Windows PowerShell's built-in System.Speech engine. These OS components
need no separate installation. macOS/Windows playback still needs native testing.

The optional native desktop mode requires its platform VSIX and an accessible
X11 display on Linux. Its tracking requirement is separate from speech: the
editor overlay and TTS do not need X11 or a native character window. Optional
sidebar mode also retains its own local/Chromium voice handling.

## Commands

- **Merlin: Start Overlay**, **Stop Overlay**, and **Hide / Show Overlay** control Merlin.
- **Merlin: Pause / Resume**, **Perform Magic**, **Speak**, and **Dismiss Speech Bubble** control actions.
- **Merlin: Read Suggested Fix** explains the current error and its language-provider fix.
- **Merlin: Show Companion** opens the optional sidebar.
- **Merlin: Status** identifies the selected rendering mode.
- Voice commands work with the editor overlay, including narration of suggested fixes.

## Settings

Movement speed, character scale, reduced motion, speech duration, diagnostic
reactions, warning reactions and reaction cooldown are configurable under
**Merlin**. Diagnostics refer to the active document and use one-based line
numbers. Changing editors cancels diagnostic speech; new speech replaces the
old bubble. Stop prevents automatic restart until Start Overlay is used.

## Development

- `npm ci` and `npm test` build and test the extension.
- `npm run package:portable` creates the cross-platform `merlin-0.6.1.vsix`.
  It excludes Electron and window-tracking executables, and includes the Linux
  speech engine/player, voices, licenses and source. Users install only this VSIX.
  Packaging needs GCC to build the tiny audio player. `npm run build:native`
  rebuilds eSpeak NG from the included source before packaging when needed.
- `scripts/build.mjs` derives scaled SVG frames from the existing PNG sprite
  sheets using JavaScript; no image tools or downloads are needed.
- Native desktop builds: install the development dependencies in `companion`,
  then `npm run package`. The script rebuilds the tracking helper and eSpeak NG,
  bundles Electron, and emits an OS/CPU-specific VSIX. Build tools are needed
  only by developers: CMake and GCC/X11 headers on Linux, Clang/Apple frameworks
  on macOS, or MinGW-w64 on Windows.
- `.github/workflows/vsix.yml` builds platform-specific native packages on their
  matching runners. Native source, speech-engine source and licenses are kept
  under `companion/native/source` in those packages.

`test/flatpak-smoke/index.cjs` is an isolated VS Code extension test harness.
Launch it with `--extensionDevelopmentPath`, `--extensionTestsPath` and a
separate user-data directory. `test/flatpak-smoke/verify.cjs` connects to that
test window's local debugging port and verifies rendered decoration CSS,
zero-width anchoring, speech bubble rendering, pointer hit-testing, typing and
selection. Artifacts are saved under `.test-artifacts`, excluded from VSIX files.

The optional native fixture remains `test/electron-smoke.cjs`. See
`docs/overlay-feasibility.md` for validation history and platform limits.
Merlin's extension code is MIT licensed. Native package notices include
Electron/Chromium licenses and eSpeak NG's GPL source and build recipe.

## How the working over-code overlay was fixed

The original implementation launched a separate transparent Electron window and
asked a native helper for VS Code's X11 window ID. In the Flatpak installation,
the extension host had an empty `DISPLAY`. The helper failed with **“X11 display
unavailable”** before a character window could even be created. Testing a native
fixture outside Flatpak did not establish that this worked inside VS Code.

Version **0.4.0** moved the default overlay into VS Code itself. The extension
adds a decoration at an empty text range in the active editor. The decoration's
pseudo-element is positioned absolutely over the editor, uses `pointer-events:
none`, and leaves the anchor width at zero. The code's spacing stays unchanged,
and clicks and selection reach the text beneath the sprite. Sprite-sheet frames
are wrapped in scaled SVG files during the build so VS Code can load them through
its own resource handling. Rendering uses no display-server connection or native window. The 0.4.x/0.5.x
portable VSIX excluded all native executables; 0.6.0 adds speech-only helpers
while continuing to exclude Electron and window-tracking helpers. The earlier native mode remains an optional `desktop` mode.

Version **0.4.1** fixed a separate movement problem. The previous state machine
started idle, waited for a random action, and could return to idle after speech,
magic or focus changes. Merlin now starts in `moving`, and finished actions
return him to `moving`. Default speed increased to 48 pixels/second. Vertical
movement includes a pixel offset within each line rather than only jumping
between line anchors. Pause and reduced motion intentionally stop roaming;
a movement speed of zero also keeps the character stationary. Stop stays stopped
across focus changes until **Start Overlay** is used.

The packaged 0.4.1 build was checked in an isolated window of the installed
Flatpak VS Code, with `DISPLAY` empty. Merlin moved 72 pixels horizontally and
24 vertically in 1.5 seconds without a movement command. Typing and dragging
through him still edited and selected the actual document. These checks now
include movement over time, rather than only checking a paused sprite.

## Roaming and animation variety (0.5.0)

Merlin follows changing destinations instead of bouncing forever along the same
diagonal. He turns gradually, picks destinations away from his current position,
and explores different parts of the visible code. The path is constrained when
the visible area changes. Horizontal travel uses a conservative 500-pixel region
because VS Code does not expose editor width through the extension API. Set
`merlin.roamingWidth` lower for narrow editor groups, or higher for a wide editor.
Travel is independent of line length, so short or blank lines do not pin Merlin
to the left edge. Vertical travel uses the visible
line range and character size. Small documents still allow horizontal roaming.

At varied intervals of 8–18 seconds, Merlin chooses magic, a disappear/reappear
journey to another location, or a brief 250–500 ms look around. Consecutive random
actions do not repeat. Disappearing finishes before relocation, and appearing
finishes before walking resumes. Speech holds his location so the bubble stays
readable; long explanations get additional reading time. Pause and reduced
motion stop both travel and random actions. Movement speed remains configurable.

## Reading errors and language-server fixes

**Merlin: Read Suggested Fix** reads the error or warning at the cursor, or the
nearest relevant diagnostic when the cursor is elsewhere. Automatic diagnostic
reactions also use this explanation instead of a generic error joke. The existing
debounce, cooldown, duplicate suppression and warning setting still apply.

Merlin asks VS Code's registered language/code-action providers for `quickfix`
actions on the diagnostic's range. He reads the diagnostic's actual message and
the preferred available fix title; for a simple single edit in the current file,
he also describes the replacement, insertion or removal. For example:

> Line 4. ts: Property 'toUppercase' does not exist. Did you mean 'toUpperCase'?
> Suggested fix: Change spelling to 'toUpperCase'. Replace “toUppercase” with
> “toUpperCase”.

This uses the suggestions already supplied by your language extension/LSP; it
needs no AI service or account. Merlin **does not apply the fix, execute the
returned action command, or change your document**. Disabled/unrelated actions
are ignored. If no quick fix exists, he says so. Slow or failed providers get a
bounded wait and an explicit unavailable message; **Read Suggested Fix** can
retry. Results are discarded when the editor, document version or current
request changes, so an old explanation cannot replace a newer one.

In the editor overlay, explanations are spoken aloud and displayed in the
on-code speech bubble. Muting keeps the text explanation available. A language extension must actually publish diagnostics and quick fixes
for Merlin to read them; Merlin does not invent a repair when none is supplied.

The packaged 0.5.0 build was also verified in Flatpak VS Code against the real
TypeScript provider: Merlin read its `toUppercase` → `toUpperCase` spelling fix
and the actual replacement edit, while the misspelled code remained unchanged.
The same check confirmed automatic roaming and typing/selection through Merlin.


## Restored editor-overlay TTS (0.6.0)

The 0.4.x/0.5.x editor overlay rendered the character correctly but only displayed
speech as text: audio was still wired to the old native/sidebar surfaces. Version
0.6.0 gives the editor overlay its own audio path. It speaks manual dialogue,
**Test Voice**, automatic error explanations and **Read Suggested Fix**. The
character continues to be rendered by editor decorations.

On Linux, the included synthesizer produces 16-bit WAV audio. The extension
validates the WAV, applies the configured volume and sends PCM samples to the
included small audio player. That player connects directly to the desktop audio
service and reports completion after its playback buffer drains. No `paplay`,
`ffplay`, Python, Electron, Speech Dispatcher, network service or download is
required. eSpeak NG source, its GPL license, build recipe and the player's source
are included under `companion/speech/source`. Rate, pitch, volume and included
voice selection are supported. macOS and Windows use their built-in engines.

New speech replaces old speech. Mute, dismissal, magic, editor switches, loss
of focus, hiding or stopping Merlin and extension disposal cancel audio. Bubble
expiry waits for speech to finish. A failed audio connection leaves the bubble
available and reports the error through a notification and **Merlin: Status** /
its output log. A five-minute timeout prevents stuck speech from persisting.

Linux playback was verified using Flatpak VS Code's Node runtime with DISPLAY
unset: synthesis completed and the audio player's desktop stream drained
successfully. The packaged 0.6.0 extension also passed Test Voice playback,
Read Suggested Fix audio startup and immediate mute cancellation in an isolated
Flatpak editor window. Movement, typing and selection through the character
remained functional. Speech needs no visible webview or panel.

## Teleport-first roaming (0.6.1)

Merlin now rests between actions and uses disappear/appear teleportation for
most trips. Occasional walks last only 1–2.5 seconds. Switching active files
clears the old character and speech, plays disappear in the new editor, chooses
a new position and plays appear before resting. This transition also completes
while roaming is paused. Reduced motion changes position immediately without
playing the transition.
