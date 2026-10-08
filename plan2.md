# Merlin v2 — Whole-window roaming and voice

## Requested outcome

Merlin should wander over the actual code text and throughout the entire VS Code window: editor groups, sidebar, panel, and other visible workbench regions. The attached screenshot shows the intended move from the confined Merlin sidebar onto the editor. Interpret “whole window” as the active VS Code window, not the whole desktop or other applications.

Add audible text-to-speech (TTS) for Merlin's spoken lines. The current implementation has no TTS: it sends text to a speech bubble and animates the sprite. Not hearing a voice is expected in v1.

This document is an implementation plan; it does not change the current extension.

## Architecture decision and feasibility gate

VS Code's public extension API does not give extensions access to the workbench DOM. The existing webview is a bounded surface and cannot paint over the editor or application chrome. Expanding the sidebar, changing CSS positioning, or opening another webview cannot implement this request.

Use a **local desktop companion application**, provisionally Electron, alongside the VS Code extension. The extension continues to own diagnostics, dialogue, settings, and commands. The desktop companion owns a transparent overlay window, sprite rendering, window tracking, and audio. This is an additional installable component, not a VSIX-only feature.

Electron provides transparent frameless windows and mouse-event pass-through. It does not by itself identify and track an unrelated VS Code window across platforms. Window identity, geometry, visibility, stacking, and focus require a platform adapter and a feasibility prototype. An always-on-top flag alone is insufficient: Merlin must not remain floating above unrelated applications.

Do not patch VS Code installation files or inject scripts into its internal workbench. Those approaches are brittle across updates and outside the supported extension API.

### First milestone: prove the overlay on the target desktop

1. Determine the development/test OS, display server (Linux X11 versus Wayland), desktop compositor, and VS Code variant.
2. Build a minimal transparent, frameless, non-focusable overlay with a stationary wizard and fully click-through input.
3. Bind it to exactly one VS Code window. Prototype a local handshake identifying the extension session, with native process/window correlation and explicit window selection if automatic identification is ambiguous. Titles alone are not stable identifiers.
4. Match the VS Code window's visible bounds; follow moves, resize, maximize, restore, display changes, and DPI scaling.
5. Hide immediately when the owning window is minimized, loses foreground status, closes, or its extension session disconnects. Verify stacking during dialogs and application switches.
6. Confirm code can be selected, scrolled, typed, dragged, and clicked underneath the wizard and bubble without focus theft.

Linux X11 can be investigated using native window-management facilities. Generic Wayland window discovery, positioning, and stacking must be treated as unproven and compositor-dependent; do not promise universal Wayland support. macOS and Windows each need their own tracking adapter and permission/packaging checks. Start with the user's actual desktop, then expand the support matrix.

**Gate:** proceed to full overlay integration only when target-window tracking, click-through behavior, and visibility handling pass on at least one explicitly documented platform. If blocked, document the specific limitation and retain sidebar mode; do not claim sidebar mode satisfies whole-window roaming. Desktop-wide roaming would be a separate opt-in scope change.

## Proposed components

```text
src/
  extension.ts                 # Commands and diagnostic lifecycle
  diagnostics.ts               # Existing selection and cooldown logic
  dialogue.ts                  # Existing friendly template library
  messages.ts                  # Versioned shared message contracts
  companionConnection.ts       # Desktop transport and session lifecycle
  merlinViewProvider.ts        # Optional sidebar fallback and status
shared/
  animation.ts                 # Renderer-independent animation state machine
  dialogueEvents.ts            # Utterance IDs, document generation, cancellation
companion/
  main.ts                      # Overlay and application lifecycle
  preload.ts                   # Narrow, validated IPC bridge
  platform/                    # Native window tracking and capability detection
  renderer/                    # Reused sprites, movement, speech bubble
  voice/                       # TTS providers and cancellation
media/merlin/                   # Reuse original sprite sheets and metadata
```

Extract reusable renderer and animation logic from the existing webview rather than maintaining two independent versions. Use an explicit rendering transport so the same speech events can reach either sidebar or overlay mode. Only one surface and one voice provider should deliver a given utterance.

## Extension-to-companion communication

- Prefer a per-user local IPC endpoint (Unix domain socket or Windows named pipe), with restrictive access, per-launch authentication, a version handshake, bounded payloads, and schema validation.
- Exchange session ID, settings, utterance ID, document generation, speech text, cancellation, commands, connection status, and heartbeat/liveness events.
- Send the selected joke only; do not send file contents or full diagnostic collections to the companion.
- Keep cooldown and duplicate suppression in the extension. Ignore stale events from old document generations or disconnected sessions.
- On editor change, diagnostic speech dismissal, disabling reactions, or shutdown, cancel pending diagnostic speech and its audio.
- Keep independent sessions for multiple VS Code windows. Only the foreground owning window roams or speaks.
- On disconnect, hide the overlay, cancel audio, and stop animation. Provide reconnect and clear status in the extension.
- For SSH/WSL/dev containers, ensure desktop communication runs locally. Verify extension placement and diagnostic forwarding; a process started in a remote extension host cannot be assumed to control the local desktop. Browser VS Code is outside the initial desktop-overlay scope.

## Whole-window renderer behavior

- Replace sidebar bounds with tracked VS Code window bounds in logical pixels. Convert native coordinates and DPI once at the platform boundary.
- Allow roaming across code text and workbench regions, keeping the complete sprite inside the window. Re-clamp on every bounds change.
- Reuse walking left/right, idle, magic, disappearing/appearing, and speaking states with one coordinated animation loop.
- Keep speech bubbles inside the tracked window, above or beside Merlin; wrap long text and use a visible tail. Reposition on movement, resize, and scale changes.
- Keep the overlay fully click-through by default. Use VS Code commands for pause, dismiss, hide, and voice controls; do not require clicking the sprite or bubble.
- Stop animation work while hidden. Respect configured and system reduced motion and pause.
- Obtain theme colors from the extension for readable light, dark, and high-contrast bubbles.
- Keep native controls/dialogs usable. Verify modal dialogs and full-screen transitions explicitly.

## Merlin voice (TTS)

### Initial voice approach

Introduce a provider interface with enumerate voices, speak, cancel, start/end/error events, and capability reporting. Prototype Chromium/system speech synthesis inside the companion, but do not assume voices exist or are audible in Electron on every OS. Inspect available voices and test actual playback on the target system.

If that backend is unavailable, add a platform-specific local TTS provider. On Linux, evaluate a detected installed engine such as Speech Dispatcher or eSpeak NG; on macOS and Windows evaluate their native speech facilities. Invoke external tools using argument arrays, never shell-interpolated joke text. Report missing engines with concrete setup guidance. Do not install system services automatically.

Prefer local synthesis for the first release, with no account or paid API requirement. A specific custom “wizard” voice is not guaranteed by installed system voices; provide voice preview and rate/pitch controls where supported. A later optional neural provider can offer a more distinctive voice, with explicit download or network requirements documented separately.

### Playback rules

- New installation: voice enabled with conservative volume; expose an obvious mute setting and a **Test Voice** command.
- Enumerate voices asynchronously, preserve a stable voice identifier, and fall back visibly if a selected voice disappears.
- Speak the same joke displayed in the bubble. Track one utterance ID across audio, bubble, and animation.
- Start speaking animation with the displayed utterance; keep the bubble visible for at least its readable duration and until audio ends. Return to idle when the utterance finishes or is dismissed.
- Never overlap voices or accumulate an unbounded diagnostic queue. Replace obsolete diagnostic utterances; keep at most the latest pending reaction.
- Dismissal cancels the matching audio. Editor changes cancel diagnostic audio; window hide/disconnect and shutdown cancel all audio.
- When muted, unavailable, or playback fails, keep text bubbles functional. Show actionable voice status without flooding notifications or repeatedly retrying.
- Handle long utterances and provider timeouts so Merlin cannot remain stuck speaking.
- Avoid redundant accessibility announcements when audible TTS is active; retain accessible text and test with a screen reader.

## Commands and settings

Retain existing commands and add:

- `Merlin: Start Desktop Companion`
- `Merlin: Stop Desktop Companion`
- `Merlin: Hide / Show Overlay`
- `Merlin: Mute / Unmute Voice`
- `Merlin: Test Voice`
- `Merlin: Select Voice`
- `Merlin: Companion Status` (connection, platform support, voice availability)

Proposed settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `merlin.displayMode` | `overlay` on supported installations | `overlay` or explicit `sidebar` fallback |
| `merlin.voice.enabled` | `true` | Audible speech |
| `merlin.voice.provider` | `auto` | Select a supported local backend |
| `merlin.voice.id` | system default | Stable installed voice identifier |
| `merlin.voice.rate` | `1` | Normalized rate within provider limits |
| `merlin.voice.pitch` | `1` | Pitch where supported |
| `merlin.voice.volume` | `0.6` | Volume where supported |
| `merlin.overlay.hideWhenUnfocused` | `true` | Foreground-window visibility policy |

Preserve movement speed, character scale, reduced motion, diagnostic settings, cooldown, and speech duration. Document unsupported settings per voice backend. If the companion is absent or unsupported, show an installation/status action; make fallback behavior visible instead of silently claiming overlay mode is running.

## Implementation roadmap

1. **Overlay feasibility prototype:** target platform detection, transparent click-through rendering, native window tracking, focus/visibility, DPI, multi-monitor behavior. Record supported configurations and limitations before implementing other adapters.
2. **Shared renderer extraction:** reuse sprites, metadata, state transitions, bounded movement, bubble layout, pause, and reduced motion in both surfaces.
3. **Local bridge:** authenticated session transport, version negotiation, settings/events, reconnect, stale-event cancellation, multi-window ownership, lifecycle cleanup.
4. **Diagnostic integration:** route existing reactions to the active renderer; preserve one-based lines, debounce, cooldown, warning preference, and resolution behavior. Remove sidebar-visibility dependency for overlay reactions.
5. **Voice implementation:** provider detection, audible preview, selection, mute, rate/pitch/volume support, utterance cancellation, animation synchronization, error fallback.
6. **Packaging:** ship the VSIX and desktop companion separately with clear install/start steps; build platform-specific native adapters, document permissions and supported OS/display-server matrix, and validate signing requirements for distributed desktop packages.
7. **Verification and release:** install both artifacts in a clean environment, test the acceptance cases below, update README, and publish only after platform claims are verified.

## Acceptance criteria and validation

### Whole-window overlay

- Merlin visibly crosses editor text, sidebar, and panel inside the owning VS Code window without needing the companion view open.
- Typing, selecting text, scrolling, dragging tabs, and clicking underlying controls work through both sprite and bubble.
- Merlin and the bubble stay in bounds after resizing, maximizing, moving between monitors, and changing scaling.
- Switching applications, minimizing, closing VS Code, disconnecting IPC, or stopping the companion hides Merlin and stops audio/animation.
- Multiple VS Code windows do not produce duplicate companions or cross-window diagnostic jokes.
- All animation types, pause, reduced motion, and theme contrast still work.

### TTS and diagnostics

- **Test Voice** produces audible speech on the documented supported installation.
- A diagnostic at zero-based line 9 is displayed and spoken as line 10.
- Rapid updates respect cooldown and never overlap or build a backlog of voices.
- Changing editors or dismissing diagnostic speech cancels stale audio and bubble content.
- A missing voice backend produces clear status while text-only speech still works.
- Muting stops current playback and prevents subsequent audio; unmuting affects future utterances.
- Long speech completes, or times out cleanly; bubble and speaking animation do not end prematurely.

Automate transport validation, session/document cancellation, diagnostic routing independent of sidebar visibility, geometry/DPI conversion, animation transitions, and TTS queue lifecycle using a fake voice provider. Manually validate native stacking, click-through, actual audible playback, themes, accessibility, and real language-server diagnostics on each claimed platform. Record unsupported Wayland/compositor configurations honestly.

## Technical references

- VS Code extension UI restrictions: https://code.visualstudio.com/api/extension-capabilities/overview
- VS Code webview boundaries: https://code.visualstudio.com/api/extension-guides/webview
- Electron window capabilities and platform caveats: https://www.electronjs.org/docs/latest/api/browser-window/
- Electron click-through interactions: https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- Electron transparent window styles: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
