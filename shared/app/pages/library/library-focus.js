export function captureEntryControlFocus() {
  const activeControl = document.activeElement;
  if (activeControl?.dataset?.libraryStateSelect) {
    return { kind: "state", showId: activeControl.dataset.libraryStateSelect };
  }
  if (activeControl?.dataset?.libraryRatingSelect) {
    return { kind: "rating", showId: activeControl.dataset.libraryRatingSelect };
  }
  return null;
}

export function restoreEntryControlFocus(focusedControl, { knownEntries, unresolvedEntries, filterNav }) {
  if (!focusedControl) return;
  const selector = focusedControl.kind === "state"
    ? `[data-library-state-select="${CSS.escape(focusedControl.showId)}"]`
    : `[data-library-rating-select="${CSS.escape(focusedControl.showId)}"]`;
  const replacement = knownEntries.querySelector(selector) || unresolvedEntries.querySelector(selector);
  if (replacement) replacement.focus({ preventScroll: true });
  else filterNav?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
