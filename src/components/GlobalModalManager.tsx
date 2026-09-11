// NAVILO modals own their own actions and layout.
// The legacy global move/minimize enhancer was visually intrusive and could
// attach controls to print previews and other dialogs. Keep this component as
// a no-op so existing imports remain safe while modal UI stays predictable.
export default function GlobalModalManager() {
  return null;
}
