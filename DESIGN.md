---
name: Accountrix Prism Workspace
description: A paper, ink, and cobalt workbench for separate client books.
colors:
  primary: "#1546ce"
  paper: "#fafaf7"
  surface: "#ffffff"
  ink: "#181b25"
  rule: "#343942"
  line: "#d7dbe2"
  soft: "#e7edfc"
  row-hover: "#f3f5fc"
  muted: "#565d69"
  source: "#f0f1ed"
  field-line: "oklch(86.9% 0.022 252.894)"
  review-background: "oklch(98.7% 0.022 95.277)"
  review-ink: "oklch(41.4% 0.112 45.904)"
  complete-background: "oklch(97.9% 0.021 166.113)"
  complete-ink: "oklch(43.2% 0.095 166.913)"
  exception-background: "oklch(96.9% 0.015 12.422)"
  exception-ink: "oklch(45.5% 0.188 13.697)"
typography:
  heading:
    fontFamily: "Manrope, sans-serif"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.428571
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.333333
  button:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.428571
rounded:
  none: "0px"
  avatar: "8px"
  switcher: "12px"
  popover: "16px"
  badge: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  control: "12px"
  row: "14px"
  md: "16px"
  stack: "20px"
  lg: "24px"
  desktop-gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  navigation-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0px 12px"
  status-review:
    backgroundColor: "{colors.review-background}"
    textColor: "{colors.review-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
  balance-register:
    backgroundColor: "{colors.paper}"
    padding: "14px 12px"
---

# Design System: Accountrix Prism Workspace

## Overview

**Creative North Star: "Prism"**

Separate workspaces, a clear accounting picture. Pale paper, white working surfaces, graphite rules, and cobalt selection give each task a defined place. Manrope supplies a consistent working voice; aligned figures and restrained labels make dense financial information readable.

This system governs the signed-in Operate workspace, including its navigation, worklists, and financial drawers. Marketing and authentication keep their incumbent surfaces. The selected preview establishes the visual direction; the implemented components determine the tokens captured here. Prism uses structural panes and flush boundaries without decorative glass blur.

**Key Characteristics:**
- Paper and white surfaces separated by thin rules.
- Cobalt actions and selection with explicit text labels.
- Square primary controls and flat work panels.
- Visible workspace identity beside financial work.
- Tabular figures and labeled mobile records.

## Colors

The palette pairs warm paper with cool ink and one action accent; amber, green, and rose retain specific accounting state meanings.

### Primary
- **Cobalt** (`primary`): primary actions, active navigation, focused controls, text actions, caret, and selected text.
- **Cobalt wash** (`soft`): navigation hover and keyboard-focused record context. The lighter `row-hover` token is reserved for pointer hover across register rows.

### Neutral
- **Paper** (`paper`): workspace ground, table headings, drawer headers, and balance strips.
- **White surface** (`surface`): work panels, fields, and drawer content.
- **Ink** (`ink`): the scoped workspace foreground and brand.
- **Graphite rule** (`rule`): structural boundaries, heading underlines, totals, and drawer edges.
- **Register line** (`line`): quiet panel boundaries and supporting separators. Existing table cells and fields also retain their inherited slate utility borders; `field-line` records the field border actually used.
- **Muted graphite** (`muted`): register headings, mobile field labels, and balance labels. Existing supporting copy retains its slate text utilities.
- **Source paper** (`source`): the source-document viewing area.

### State roles
- **Amber evidence** (`review-background`, `review-ink`): review, unverified posting, unmatched items, awaiting payment, and partial payment. Read the label to distinguish these states.
- **Verified green** (`complete-background`, `complete-ink`): paid, complete, posted, matched, approved, or balanced states.
- **Exception rose** (`exception-background`, `exception-ink`): overdue, rejected, or void states. The implementation retains these functional colors; the preview's oxblood role is not a new production token.

**The State Meaning Rule.** Use status colors with their visible state labels. Cobalt indicates interaction or selection; it does not establish that money has been posted, paid, or reconciled.

## Typography

**Display and Body Font:** Manrope, with a sans-serif fallback. The application loads it through `next/font/google`, exposes `--font-workspace`, and applies it to workspace surfaces and financial drawers. Existing marketing and authentication typography is outside this scope.

**Character:** Clear, compact, and deliberate. Weight, alignment, and rules carry hierarchy without an additional decorative or monospaced typeface.

### Hierarchy
- **Heading:** the frontmatter's `heading` role uses a fluid size (`clamp(1.65rem, 2.5vw, 2rem)`) for page titles. Descriptions are limited to approximately (70ch).
- **Title:** the `title` role covers financial drawer headings; panel headings use semibold body sizing.
- **Body:** the `body` role covers register and working copy. Form fields use (16px) below the small breakpoint and (14px) above it.
- **Label:** the `label` role covers worklist labels, status chips, and supporting metadata. Ordinary table headings retain sentence case.
- **Button:** the `button` role keeps actions readable beside records. Labels describe the accounting action or destination.

**The Aligned Figures Rule.** Use tabular numerals for financial values, align desktop amount columns to the right, and preserve currency and precision supplied by the money formatter. Calculation and posting semantics belong to the accounting implementation, not visual tokens.

## Layout

Desktop uses a fixed navigation spine (16rem wide) from the large breakpoint (1024px). Content offsets by that width and sits in a fluid container capped at (90rem). Content gutters progress from (16px) to (24px) at (640px), then (28px) at the large breakpoint. The top bar has a minimum height of (64px); wrapped mobile context may increase it.

Page headings end in a single structural rule. Reusable white panels contain related work; worklists place wrapping search and filters above a register and pagination below it. The observed spacing scale in the frontmatter includes the deliberate (14px) row step, alongside the regular small and medium spacing steps.

Below desktop width, navigation becomes a dismissible off-canvas panel. On narrow screens the active workspace selector occupies a full header row, allowing the client name to wrap. Up to (639px), the top bar stays sticky at the viewport top with a stacking level of (30); the document review target reserves a scroll margin of (140px) so it clears that context. Financial preview drawers repeat the workspace name below their title. Keep identity visible at (320px), including when the navigation panel is closed and while scrolling the review form.

Invoice and bill workbench tables become labeled two-column record grids at widths up to (640px), with the first identifying cell spanning both columns. Each cell preserves its `data-label`; financial values become left-aligned and may wrap. This behavior belongs to the workbench table variant: other existing tables retain their horizontal overflow wrapper. Compact density reduces desktop cell block padding to (5px); narrow-screen record padding remains readable.

Financial drawers occupy the right edge, use viewport height, and are capped at (52rem); they fill narrow viewports. Their context header stays visible while content scrolls. Source documents become sticky beside review controls at the large breakpoint. Document actions are sticky on larger screens and return to document flow on mobile.

## Elevation & Depth

Work panels are flat, with no card shadow. White-on-paper separation and graphite rules establish structure. Overlay depth is reserved for components that actually cover other work: the financial drawer has a leftward shadow (`-12px 0 36px #181b2524`) and a dimmed backdrop (`#181b2559`). The existing workspace picker retains its rounded, shadowed popover treatment.

**The Ruled Surface Rule.** Use borders, alignment, and tonal separation for ordinary work. Preserve overlay shadows for drawers and pickers rather than spreading them across register panels.

## Shapes

Primary and secondary workspace buttons, fields, navigation selections, brand marks, text actions, headings, and work panels have square corners. Main controls have a minimum height of (42px); navigation rows use (46px), and tabs use (44px).

This adoption retains functional shape exceptions: rounded status chips, workspace avatars, the workspace switcher, and its popover. Use the frontmatter's corresponding radius roles when extending those components. Do not infer that every existing control or notice has been flattened.

## Components

### Buttons
Direct and compact. Primary buttons use a cobalt fill with white text, square corners, and the documented padding. The final Prism override keeps their cobalt fill through hover. Secondary buttons retain white, slate text and borders, plus a pale blue hover fill. Text actions use cobalt with no enclosing fill at rest. Disabled actions retain the existing reduced opacity and disabled cursor.

Workspace focus uses a cobalt outline (2px) with an offset (3px); the top bar retains its existing (2px) offset. Preserve keyboard focus across links, buttons, fields, summary controls, and drawers. Color transitions use the inherited Tailwind timing; reduced-motion preferences suppress workspace and drawer transitions.

### Chips
Small, rounded, explicitly labeled state markers. The state chip includes a current-color dot, compact padding, and the semantic roles documented in Colors. A neutral draft chip keeps its incumbent slate treatment. Do not replace posting or payment labels with a color alone.

### Cards / Containers
White, square, and flat. The reusable panel provides the boundary while children supply contextual padding. A headed panel uses a thin internal divider. The balance register uses paper, strong outer rules, muted labels, and bold tabular values; it is a supporting record component, not a second dashboard.

### Inputs / Fields
White, square fields use the incumbent slate stroke, shared control height, and cobalt focus. Keep visible labels, established placeholder contrast, and field-associated errors. A source document's background belongs to evidence viewing, not to editable field styling.

### Navigation
The paper sidebar has a graphite right edge. Active destinations use a solid cobalt rectangle with white text; hover uses cobalt wash. Labels and icons remain visible, and section groups keep their working hierarchy. Workflow tabs use an underline for the selected destination and wrap when needed. The workspace switcher remains a named, searchable control with visible active identity and keyboard navigation.

### Registers and financial drawers
Tables use sentence-case headings, thin row rules, top-aligned cells, and a stronger totals boundary. Hover and focused-record backgrounds help track a row without changing its financial meaning. Mobile records expose their labels rather than hiding financial columns.

The financial drawer is a modal record preview or account activity view. Its header includes the record title, active workspace name, and a labeled close button. Record previews retain a route to the full record for posting, payment, and correction actions. Source documents remain evidence; their review UI must distinguish a paid purchase, a bill, and evidence attached to an existing bill.

## Do's and Don'ts

### Do:
- **Do** apply Prism to Operate workspace surfaces and financial drawers, using the scoped workspace font.
- **Do** keep the active workspace name visible in narrow headers and financial drawers.
- **Do** preserve visible status labels, field labels, mobile record labels, and keyboard focus.
- **Do** use tabular money values and existing exact-money formatting without altering accounting semantics.
- **Do** keep source evidence, recorded bills, and payments visibly distinct.
- **Do** extend the existing navigation, state components, and role-aware controls.

### Don't:
- **Don't** introduce decorative glass blur into the selected pane-and-rule system.
- **Don't** enable OS dark mode from this light-only workspace contract.
- **Don't** spread Prism typography or workspace styling into marketing and authentication without a separate approved change.
- **Don't** infer posting, payment, or reconciliation success from cobalt selection or a balanced visual layout.
- **Don't** add repeated summary surfaces where a register, source record, or existing dashboard already owns that information.
- **Don't** erase retained status, switcher, or popover behavior to make every element square.
