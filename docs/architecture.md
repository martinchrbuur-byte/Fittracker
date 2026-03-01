# Architecture

- SPA: HTML/CSS/JS only, mobile‑first.
- Global `state` synced to/from `localStorage`.
- Render funcs (`rToday`, `rPlan`, `rCal`, `rTem`) rebuild DOM segments.
- Tabs toggle via CSS classes and event listeners.
- Mutations update state, call `save()` then re-render.
- Calendar uses ISO-date math and `nameFor()`.
- New features: extend state, update load/validate, follow patterns.

## Components
- **Tabs/navigation**: Four views (Today, Plan, Data, Calendar) toggled by buttons.
- **State management**: Global `state` object, synced to/from `localStorage` via helper functions. Includes newly added `templates` for exercise groups and `appliedTemplates` to track which template has been applied to each split day.
- **Rendering**: Render functions (`renderTodayTab`, `renderPlanAccordion`, `renderCalendar`) build DOM elements dynamically.
- **Events**: Inline listeners for buttons, drag-and-drop handlers, and input events.

## Data Flow
1. On `DOMContentLoaded`, `loadState` initializes state from `localStorage` or defaults.
2. UI setup functions (`setupTabs`) register event handlers.
3. Render functions populate each tab using current state.
4. Mutations (add/delete exercise, rename/move days, mark today, import/export) update state and call `saveState()` then re-render.

## Persistence
- Data stored as JSON strings in specific `localStorage` keys (see data-model.md).
- On import, JSON is validated and replaces state.
- Reset clears keys and reinitializes.

## Extensions
- New features should modify state structure carefully and include migration logic in `loadState` or validation.
- UI changes should follow existing patterns of DOM creation and event binding.

*Refer to data-model.md for detailed storage structure.*