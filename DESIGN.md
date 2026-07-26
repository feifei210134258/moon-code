---
name: Moon Code
description: A clear, efficient Kimi Code-native desktop workbench for staying in project context.
colors:
  window-bg: "#F6F9FC"
  surface: "#FFFFFF"
  glass: "#F6F9FCE6"
  surface-quiet: "#F0F5FBE6"
  surface-panel: "#EAF1F7"
  border: "#0F172A17"
  border-strong: "#0F172A29"
  text: "#20252D"
  muted: "#5D6673"
  faint: "#697386"
  blue: "#3085FA"
  blue-soft: "#3085FA14"
  green: "#43A047"
  green-soft: "#43A0471A"
  red: "#E25555"
  red-soft: "#E255551A"
  amber: "#A56712"
  ink-soft: "#3D4756"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "20px"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.35
  title:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.45
  body:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.68
  label:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "11px"
    fontWeight: 590
    lineHeight: 1.35
    letterSpacing: "0.01em"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "5px"
  sm: "7px"
  md: "9px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "31px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "31px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "31px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "32px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "38px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "13px 14px 10px"
  interaction-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "0"
  right-sidebar-card:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "11px 12px 12px"
---

# Design System: Moon Code

## 1. Overview

**Creative North Star: "The Quiet Control Room"**

Moon Code is a focused developer workbench: calm enough for long sessions, dense enough to keep project state close, and explicit enough that an Agent action never feels mysterious. The current homepage establishes a cool, near-white canvas with translucent workspace layers, one blue action accent, and compact status surfaces. The system should feel like a well-calibrated instrument panel rather than a marketing page.

The visual language serves the product personality captured in `packages/kimi-adapter/PRODUCT.md`: **高效、清晰、可靠**. Preserve the existing desktop-tool familiarity—Inter and system fallbacks, Phosphor icons, restrained borders, and small state pills—while tightening anything that competes with the task. The system explicitly rejects over-gamified UI, marketing-landing-page composition, and dense information without hierarchy.

The following are captured optimizations rather than a new visual direction: raise the floor for persistent text to 11px, replace failing faint-gray text with a darker semantic muted ramp, collapse empty panels instead of reserving dashboard-sized space, and avoid pairing a strong border with a 16px+ soft shadow. A missing data value must never render as a full progress bar.

**Key Characteristics:**

- Cool light workbench surfaces with a restrained blue primary.
- Compact, familiar controls with 7–12px corner radii.
- State-rich but low-saturation semantic colors for runtime, usage, warning, and error.
- Layered panels and dividers establish hierarchy; decoration stays subordinate to transcript and task content.
- Motion is short, state-driven, and disabled or reduced for `prefers-reduced-motion`.

## 2. Colors

The palette is a restrained cool-neutral system: white content surfaces sit on a blue-gray window field, while one medium-bright blue carries action, selection, and focus. Green, amber, and red are reserved for semantic state.

### Primary

- **Moon Blue** (#3085FA): Primary actions, active selections, links, progress tracks, focus accents, and question states. Keep it scarce enough that an active control is immediately legible.
- **Moon Blue Soft** (#3085FA14): Tinted background for selected or informational states; never use it as decorative page fill.

### Secondary

- **Operational Green** (#43A047): Healthy runtime and plan usage. Use for state, not branding.
- **Caution Amber** (#A56712): Starting/stopping runtime, approaching usage limits, and approval states. The darker tone keeps semantic text legible on light surfaces.
- **Failure Red** (#E25555): Errors, abort/stop actions, and critical usage.

### Neutral

- **Window Field** (#F6F9FC): Main application background.
- **Surface White** (#FFFFFF): Transcript, composer, menus, dialogs, and content containers.
- **Quiet Surface** (#F0F5FBE6): Secondary cells, token summaries, and low-emphasis grouping.
- **Panel Surface** (#EAF1F7): Non-white background for the three right-sidebar cards; it separates work categories without adding decorative shadows.
- **Ink** (#20252D): Primary text and high-confidence labels.
- **Muted Ink** (#5D6673): Supporting text, metadata, and secondary labels.
- **Faint Ink** (#697386): Lowest-emphasis readable text on white and near-white surfaces. Reserve it for non-essential chrome; meaningful body copy should still use Muted Ink or Ink.
- **Border** (#0F172A17) and **Strong Border** (#0F172A29): Hairline separators and control boundaries.

### Named Rules

**The One Accent Rule.** Moon Blue is for action, selection, focus, and information state. Do not use it as a general decoration or large background wash.

**The State-Truth Rule.** If a value is unavailable, show an unavailable state (`--`, empty, or a connection prompt) and no proportional fill. Never imply usage or progress that the data does not support.

## 3. Typography

**Display Font:** Inter (with the system UI stack fallback above)

**Body Font:** Inter (with the system UI stack fallback above)

**Label/Mono Font:** Inter for labels; SFMono-Regular/Consolas/Liberation Mono for code, paths, and terminal content.

**Character:** One well-tuned sans keeps the tool familiar and quiet. Weight, spacing, and semantic color—not decorative font pairing—create hierarchy. Chinese fallback fonts should remain in the same system stack so mixed-language chrome does not jump registers.

### Hierarchy

- **Display** (680, 20px, 1.2): Brand lockup and rare high-confidence headings.
- **Headline** (650, 17px, 1.35): Markdown h2 and prominent panel headings.
- **Title** (650, 14px, 1.45): Panel titles, transcript section labels, and important control text.
- **Body** (400, 13.5px, 1.68): Transcript prose and user-facing explanatory copy. Keep prose lines near 65–75ch where the surface allows; compact task metadata may be denser.
- **Label** (590, 11px, 1.35, slight tracking): Buttons, nav items, status labels, and metadata. 10px is the lower limit for transient badges only; persistent text should not use 8–9px.
- **Mono** (400, 10.5px, 1.55): Code, paths, diffs, and terminal output. Do not use mono for ordinary UI labels.

### Named Rules

**The Readable Floor Rule.** Persistent interface copy is at least 11px and must meet a 4.5:1 contrast target where it carries meaning. Do not use wide tracking to compensate for text that is too small or too light.

## 4. Elevation

Depth is primarily tonal layering and hairline separation. The current implementation uses translucent panels and broad shadows; keep translucency purposeful around the top bar and transient menus, but tighten the shadow vocabulary so a popover reads as an affordance rather than a floating card. Do not combine a 1px border with a 16px+ diffuse shadow on the same decorative element.

### Shadow Vocabulary

- **Popover:** `0 4px 8px rgba(15, 23, 42, 0.12)`. Use for menus, usage/context popovers, and command suggestions. Pair it with a neutral hairline only when the boundary is necessary against the surrounding surface.
- **Panel lift:** `0 4px 12px rgba(15, 23, 42, 0.08)`. Use sparingly for an interaction dock or transient side panel.
- **Focus ring:** `0 0 0 3px rgba(48, 133, 250, 0.16)`. This is state communication, not elevation.

### Named Rules

**The Layered-Not-Glossy Rule.** Use a neutral surface change or a hairline before reaching for blur or shadow. Backdrop blur is reserved for the draggable top bar and transient overlays; it is not the default treatment for every card.

## 5. Components

### Buttons

- **Shape:** 7–9px radius for ordinary controls; 10px for the 35px send button. Full-pill is reserved for status chips and progress tracks.
- **Primary:** Moon Blue background with white text, 31px minimum height, 11px horizontal padding, and a clear disabled opacity. The send action may use 35px square geometry because it is an icon-led composer control.
- **Hover / Focus:** Slightly darker or more opaque surface on hover; use the shared 3px focus ring on focus-visible. Avoid lift or glow as a default hover animation.
- **Secondary / Quiet:** White surface + strong border for secondary actions; transparent muted text for quiet actions. Both retain the same height and label scale as primary buttons.

### Chips

- **Style:** Compact 5–7px radius for model/effort and queue labels; 999px only for usage/status pills and progress tracks.
- **State:** Blue-soft for informational or selected state, amber-soft for queued/caution, red-soft for critical/error. Pair color with text or icon; never communicate state by color alone.

### Cards / Containers

- **Corner Style:** 9px controls, 12px content containers, 14px transient popovers. Avoid 24px+ rounding.
- **Background:** Surface White for primary content, Panel Surface for the three right-sidebar category cards, Glass for the top bar and purposeful overlays, and Quiet Surface for secondary grouping.
- **Shadow Strategy:** Follow the Elevation vocabulary. A card gets a border or a shadow; it does not need both.
- **Border:** Hairline neutral by default; semantic border tints only when they clarify approval, question, warning, or error state.
- **Internal Padding:** 8–14px for compact controls and cards; 18px for sidebar rhythm; 24px only for spacious empty or explanatory states.

### Inputs / Fields

- **Style:** 32px search and select fields with 7–8px radius, white or quiet-surface fill, and a transparent border until focused.
- **Focus:** Shared Moon Blue focus ring and a stronger input border. The shell owns focus for compound controls such as search.
- **Error / Disabled:** Error uses Failure Red plus an explanatory message; disabled states reduce opacity and interactivity without making the label unreadable.

### Navigation

- **Style:** 56px top bar with macOS title-bar breathing room, then a 244–280px project sidebar that collapses below 920px. Project and session rows are 38px high with 9–10px radius.
- **Default / Hover / Active:** Transparent at rest, low-opacity ink tint on hover, and a cool blue-gray selected surface (`#E7EEF7` / `#EAF1F8`) for the active workspace or session. Keep action buttons discoverable without shifting row text.
- **Project icon semantics:** Project rows always use the familiar folder icon. Do not replace it with a disclosure caret; the full project row already owns expand/collapse behavior, while the icon identifies the object type.
- **Responsive treatment:** At ≤1180px, right panels become overlay surfaces; at ≤920px the sidebar and top-bar context collapse so the transcript remains primary.

**The Object-Before-State Rule.** In persistent navigation, the leading icon identifies what an item is before showing what state it is in. A project remains a folder whether expanded or collapsed; state may be conveyed by its revealed children, selection surface, or accessible attributes without replacing the folder glyph.

### Composer

The composer is the signature work surface: a centered 810px maximum white field, 12px radius, 13–14px internal padding, and a visible focus state. Attachments, slash commands, `@` mentions, plan/collaboration controls, and send/stop states share one vocabulary. When disabled, the composer should contract to a compact explanation instead of reserving a large empty block.

The model summary is the single entry point for session controls. Its popover reveals model and thinking strength first, then keeps approval and execution modes behind an **Advanced Execution** disclosure. Enabling **Fully Automatic** requires an inline confirmation that explains the session-scoped consequence. Slash-command and file-mention menus are fixed-position listboxes anchored to their trigger, flip toward available viewport space, dismiss on outside interaction, and preserve explicit loading, empty, failure, and retry states. Selecting a file inserts a trailing space so the user can continue typing without repairing the token.

### Transcript Timeline

The TOC rail is the homepage's distinctive component. Keep it as a quiet, scroll-aware navigation aid: 2px ticks, short previews on hover, and one active tick. Its measured width animation is acceptable because it encodes turn height, but it should remain subtle and disabled under reduced motion.

### Right Sidebar Category Cards

Changes, Plan, and Background Tasks remain three separate cards because they represent distinct operational concerns. Each uses Panel Surface (`#EAF1F7`), a 12px radius, an 11–12px inset, and a neutral hairline with no shadow. Lists inside stay borderless and linear so the categories read as cards without becoming nested card stacks.

## 6. Do's and Don'ts

### Do:

- **Do** use Moon Blue only for action, selection, focus, links, and information state.
- **Do** preserve the cool light workbench field and white transcript/composer surfaces as the homepage baseline.
- **Do** keep controls familiar: Phosphor icons, consistent 7–12px radii, shared button heights, and explicit hover/focus/disabled states.
- **Do** keep persistent UI text at 11px or larger and verify 4.5:1 contrast for meaningful copy.
- **Do** collapse empty plans, changes, tasks, and usage surfaces to a teaching empty state with a next action.
- **Do** make runtime, usage, approval, and error state visible in both text and semantic color.
- **Do** respect `prefers-reduced-motion` and keep all state transitions short (roughly 120–250ms).
- **Do** keep the interface high-efficiency, clear, and reliable within the user's project context.

### Don't:

- **Don't** make the product feel over-gamified or like a marketing landing page.
- **Don't** stack information without hierarchy; empty panels should not look like broken dashboards.
- **Don't** use 8–10px gray text for persistent labels, timestamps, or errors.
- **Don't** pair a 1px border with a 16px+ diffuse shadow on the same card or popover.
- **Don't** use decorative glassmorphism as the default treatment for every surface.
- **Don't** use a thick side-stripe border as a generic accent; markdown blockquotes are the only content-specific exception and should remain restrained.
- **Don't** animate layout properties unless the motion communicates a real measured state, such as the TOC rail or progress bar.
- **Don't** render a full progress track when usage/context data is unavailable.
- **Don't** rely on color alone for runtime, approval, warning, or error status.
- **Don't** mix unexplained English chrome into otherwise Chinese UI; choose a deliberate language strategy per surface.
