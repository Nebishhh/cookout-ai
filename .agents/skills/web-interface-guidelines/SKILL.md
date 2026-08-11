---
name: web-interface-guidelines
description: Review UI code for Vercel Web Interface Guidelines compliance including accessibility, focus states, forms, animation, and responsive design.
---

# Web Interface Guidelines

Review UI files for compliance against Vercel's Web Interface Guidelines.

## Rules

### Accessibility

- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Interactive elements need keyboard handlers (`onKeyDown`/`onKeyUp`)
- `<button>` for actions, `<a>`/`<Link>` for navigation (not `<div onClick>`)
- Images need `alt` (or `alt=""` if decorative)
- Decorative icons need `aria-hidden="true"`
- Async updates (toasts, validation) need `aria-live="polite"`
- Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before ARIA
- Headings hierarchical `<h1>`–`<h6>`; include skip link for main content
- `scroll-margin-top` on heading anchors

### Focus States

- Interactive elements need visible focus: `focus-visible:ring-*` or equivalent
- Never `outline-none` / `outline: none` without focus replacement
- Use `:focus-visible` over `:focus` (avoid focus ring on click)
- Group focus with `:focus-within` for compound controls

### Forms

- Inputs need `autocomplete` and meaningful `name`
- Use correct `type` (`email`, `tel`, `url`, `number`) and `inputmode`
- Never block paste (`onPaste` + `preventDefault`)
- Labels clickable (`htmlFor` or wrapping control)
- Disable spellcheck on emails, codes, usernames (`spellCheck={false}`)
- Checkboxes/radios: label + control share single hit target (no dead zones)
- Submit button stays enabled until request starts; spinner during request

### Animation

- Respect `prefers-reduced-motion`
- Animate `transform` and `opacity` only (avoid animating layout properties)
- Keep micro-interactions under 200ms
- Use smooth, natural easing (`cubic-bezier(0.16, 1, 0.3, 1)`)

### Responsive & Layout

- Mobile-first approach with consistent breakpoints
- Support tap targets at least 44x44px on mobile
- Prevent horizontal scroll overflow
- Handle long text with truncation or multiline wrapping
