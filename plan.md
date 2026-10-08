# Merlin — VS Code Wizard Companion

## Goal

Build a VS Code extension named **Merlin**: a playful, animated 8-bit wizard companion inspired by VS Code Pets. Merlin wanders around his view, reacts to code diagnostics, and delivers funny lines in dynamically sized speech bubbles.

## Core requirements

### Wizard character and movement

- Use an original 8-bit pixel-art wizard with a hat, robe, and magic wand.
- Render sprites with crisp pixel edges, without image smoothing.
- Let Merlin move autonomously around the available companion area, pause, change direction, and perform animations.
- Keep Merlin and his speech bubble within the visible area when the view is resized.
- Keep movement unobtrusive and provide pause and reduced-motion controls.

### Animation states

Provide at least five distinct animation types:

1. **Moving:** walking frames with left and right facing directions.
2. **Idle:** subtle breathing, blinking, or hat movement.
3. **Wand / magic:** wand waving with a small magical effect.
4. **Disappear / appear:** a paired teleport sequence, such as dissolving into sparkles and reappearing elsewhere.
5. **Speaking:** visible mouth, face, or body movement while a speech bubble is displayed.

Use an animation state machine to manage transitions. Avoid overlapping incompatible animations; return to idle or movement when an action finishes. Appear and disappear can be separate internal states while belonging to one animation type.

### Funny diagnostic reactions

- React to errors reported for the active editor document.
- Read diagnostics through VS Code's diagnostic API, including diagnostics published by language servers. A separate LSP client is unnecessary for this feature.
- Use the diagnostic's starting line, converting its zero-based index to a user-facing one-based line number.
- Example lines:
  - “It seems you have an error at line {line}. Shall I blame the goblins?”
  - “Line {line} has displeased the compiler spirits.”
  - “My wand says line {line} needs a little less chaos.”
  - When previously reported errors are resolved: “The errors have vanished! Clearly, my magic worked.”
- Select from varied templates and avoid immediately repeating the same joke.
- Debounce diagnostic changes and apply a configurable cooldown so Merlin does not interrupt on every keystroke.
- Prefer errors over warnings; make warning reactions optional.
- Handle missing diagnostics, closed documents, and editor switches without stale line references.
- Keep reactions friendly and avoid mocking the developer.

### Speech bubbles

- Display a speech bubble whenever Merlin speaks, with all text inside the bubble.
- Size the bubble dynamically to its content using content-driven CSS layout, padding, and a maximum width.
- Wrap long text and position the bubble above or beside Merlin, with a tail pointing toward him.
- Reposition the bubble near view edges so neither bubble nor character is clipped.
- Keep the bubble visible long enough to read, based on message length, and allow dismissal.
- Synchronize the speaking animation with bubble visibility.
- Support VS Code themes, readable contrast, and accessible text announcements.

## VS Code surface and technical approach

Use TypeScript for the extension host and an HTML/CSS/TypeScript webview for Merlin's sprites, movement, and bubbles.

**Initial surface:** a dedicated companion webview view that users can place in the sidebar or panel, following the general VS Code Pets interaction model. Movement takes place inside that view. A normal extension webview does not provide an arbitrary overlay across VS Code's editor and application chrome; a literal full-window roaming character would require a separate feasibility investigation.

### Extension host

- Register Merlin's companion view and commands.
- Subscribe to diagnostic changes and active-editor changes.
- Read current diagnostics, choose a relevant reaction, and send structured messages to the webview.
- Maintain cooldowns and duplicate suppression outside the rendering layer.
- Read settings and dispose of listeners when the extension is deactivated.

### Webview

- Load local sprite assets and render the companion.
- Run movement and animation through one coordinated animation loop.
- Manage idle, moving, magic, disappearing, appearing, and speaking states.
- Render and measure speech bubbles, keeping them inside view bounds.
- Pause background animation when the view is hidden and respect reduced-motion preferences.
- Use a restrictive content security policy and render speech as text, never executable HTML.

### Suggested project structure

```text
src/
  extension.ts
  merlinViewProvider.ts
  diagnostics.ts
  dialogue.ts
  messages.ts
webview/
  main.ts
  animation.ts
  movement.ts
  speechBubble.ts
  styles.css
media/
  merlin/
    idle.png
    moving.png
    magic.png
    disappear.png
    appear.png
    speaking.png
    animations.json
package.json
README.md
```

Record sprite frame dimensions, frame counts, timing, looping behavior, and sprite anchor points in animation metadata.

## Commands and settings

Commands:

- `Merlin: Show Companion`
- `Merlin: Pause / Resume`
- `Merlin: Perform Magic`
- `Merlin: Speak`
- `Merlin: Dismiss Speech Bubble`

Settings:

- Enable or disable diagnostic reactions.
- Configure reaction cooldown and speech duration.
- Enable warning reactions.
- Configure movement speed and reduced motion.
- Configure character scale while preserving pixel-art rendering.

## Implementation roadmap

### 1. Extension foundation

- Scaffold a TypeScript VS Code extension with build and debug configuration.
- Register the companion view, show command, and basic settings.
- Render a placeholder wizard in the webview and establish typed host/webview messages.

### 2. Pixel art and animation

- Create original sprite sheets for all five required animation types.
- Implement animation metadata and the state machine.
- Add bounded autonomous movement, direction changes, resizing behavior, and pause support.

### 3. Speech and personality

- Implement dynamic bubble sizing, wrapping, edge positioning, and dismissal.
- Coordinate speaking animation and readable message duration.
- Add a varied library of friendly wizard jokes and manual speech/magic commands.

### 4. Diagnostic integration

- Read active-document diagnostics and convert line numbers correctly.
- Add error selection, debounce, cooldown, duplicate suppression, and optional warnings.
- React to resolved errors only after a previously observed error state.
- Clear or replace stale diagnostic speech when the active document changes.

### 5. Polish and release

- Verify light, dark, and high-contrast themes and reduced-motion behavior.
- Check hidden-view performance, cleanup, and repeated opening/closing.
- Document commands, settings, companion placement, and supported behavior.
- Package a VSIX and validate it in a clean Extension Development Host.

## Acceptance criteria

- Merlin can be opened as a VS Code companion view.
- The original 8-bit wizard moves autonomously and stays within that view.
- Moving, idle, magic, disappear/appear, and speaking animations are visibly distinct and functional.
- An error at diagnostic index 9 produces a joke referencing line 10.
- Rapid diagnostic updates do not produce a flood of speech or repeated jokes.
- Changing editor documents does not leave Merlin announcing stale diagnostics.
- Every spoken line appears inside a dynamically sized bubble, including long and wrapped lines.
- Speech bubbles remain visible and readable near each view boundary and after resizing.
- Pause, reduced motion, and diagnostic-reaction settings work.
- Hiding or closing the view stops unnecessary animation work, and disposal removes event listeners.

## Validation

- Unit-test diagnostic selection, one-based line conversion, cooldown/deduplication, and animation transitions.
- Manually test each animation and bubble placement at narrow and wide view sizes.
- Test diagnostics using a language extension that publishes real errors, including fixing errors and switching files.
- Verify the packaged extension in VS Code with multiple themes and reduced motion enabled.
