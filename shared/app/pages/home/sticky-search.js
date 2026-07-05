export function createStickyBrowseController({ elements, state, stickyFilterDropdownController }) {
  let stickySearchManuallyExpanded = false;

  const isStickySearchFocused = () => document.activeElement === elements.stickySearchInput;

  const syncStickySearchAccessibility = (isExpanded) => {
    elements.stickySearchToggle.setAttribute("aria-expanded", String(isExpanded));
    elements.stickySearchToggle.setAttribute(
      "aria-label",
      isExpanded && !state.query ? "Collapse archive search" : "Expand archive search",
    );
    elements.stickySearchField.setAttribute("aria-hidden", String(!isExpanded));
    if (isExpanded) {
      elements.stickySearchInput.removeAttribute("tabindex");
      return;
    }

    elements.stickySearchInput.setAttribute("tabindex", "-1");
  };

  const syncStickySearchMode = ({ focusInput = false, preserveManual = false, returnFocus = false } = {}) => {
    if (!preserveManual && !state.query && !isStickySearchFocused()) {
      stickySearchManuallyExpanded = false;
    }

    const shouldExpand = Boolean(state.query || stickySearchManuallyExpanded);
    elements.stickyBrowseBar.dataset.mode = shouldExpand ? "expanded" : "collapsed";
    syncStickySearchAccessibility(shouldExpand);

    if (!shouldExpand && stickyFilterDropdownController.isOpen()) {
      stickyFilterDropdownController.close();
    }

    if (focusInput && shouldExpand) {
      window.requestAnimationFrame(() => {
        elements.stickySearchInput.focus({ preventScroll: true });
      });
    }

    if (returnFocus && !shouldExpand) {
      window.requestAnimationFrame(() => {
        elements.stickySearchToggle.focus({ preventScroll: true });
      });
    }
  };

  const expandStickySearch = ({ focusInput = true } = {}) => {
    stickySearchManuallyExpanded = true;
    syncStickySearchMode({ focusInput, preserveManual: true });
  };

  const collapseStickySearch = ({ returnFocus = false } = {}) => {
    if (state.query) {
      return;
    }

    stickySearchManuallyExpanded = false;
    syncStickySearchMode({ returnFocus });
  };

  const setStickyBrowseVisibility = (isVisible) => {
    const nextVisibility = isVisible ? "visible" : "hidden";
    if (elements.stickyBrowseBar.dataset.visibility === nextVisibility) {
      return;
    }

    elements.stickyBrowseBar.dataset.visibility = nextVisibility;
    elements.stickyBrowseBar.setAttribute("aria-hidden", String(!isVisible));
    if (!isVisible && stickyFilterDropdownController.isOpen()) {
      stickyFilterDropdownController.close();
    }
    if (!isVisible && !state.query) {
      stickySearchManuallyExpanded = false;
    }
    syncStickySearchMode();
  };

  const markExpanded = () => {
    stickySearchManuallyExpanded = true;
  };

  const handleStickySearchToggle = () => {
    if (state.query) {
      expandStickySearch();
      return;
    }

    if (elements.stickyBrowseBar.dataset.mode === "expanded") {
      collapseStickySearch({ returnFocus: true });
      return;
    }

    expandStickySearch();
  };

  const handleStickySearchFocus = () => {
    stickySearchManuallyExpanded = true;
    syncStickySearchMode();
  };

  const handleStickySearchBlur = () => {
    window.requestAnimationFrame(() => {
      if (!state.query && !isStickySearchFocused()) {
        collapseStickySearch();
      }
    });
  };

  return {
    collapseStickySearch,
    expandStickySearch,
    handleStickySearchBlur,
    handleStickySearchFocus,
    handleStickySearchToggle,
    isStickySearchFocused,
    markExpanded,
    setStickyBrowseVisibility,
    syncStickySearchMode,
  };
}
