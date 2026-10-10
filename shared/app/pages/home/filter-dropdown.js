const FILTER_DROPDOWN_OPEN_DURATION_MS = 190;
const FILTER_DROPDOWN_CLOSE_DURATION_MS = 150;
const FILTER_POPOVER_EDGE_GAP_PX = 12;
const FILTER_POPOVER_ANCHOR_GAP_PX = 10;
const FILTER_POPOVER_MIN_HEIGHT_PX = 280;
const FILTER_POPOVER_MAX_HEIGHT_PX = 300;

export function initializeFilterDropdownController({ filterDropdown, filterToggle }) {
  let stateTimer = 0;
  let openFrame = 0;

  if (!(filterDropdown instanceof HTMLElement) || !(filterToggle instanceof HTMLButtonElement)) {
    return {
      close() {},
      isOpen() {
        return false;
      },
      open() {},
    };
  }

  filterDropdown.hidden = true;
  filterDropdown.dataset.state = "closed";
  filterDropdown.classList.remove("hidden");

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clearTimers = () => {
    if (stateTimer) {
      window.clearTimeout(stateTimer);
      stateTimer = 0;
    }
    if (openFrame) {
      window.cancelAnimationFrame(openFrame);
      openFrame = 0;
    }
  };

  const isOpen = () => !filterDropdown.hidden && filterDropdown.dataset.state !== "closing";

  const positionPopoverForViewport = () => {
    filterDropdown.style.removeProperty("max-height");
    delete filterDropdown.dataset.placement;

    const toggleRect = filterToggle.getBoundingClientRect();
    const dropdownRect = filterDropdown.getBoundingClientRect();
    const viewportHeight = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
    const availableAbove = Math.max(
      0,
      toggleRect.top - FILTER_POPOVER_ANCHOR_GAP_PX - FILTER_POPOVER_EDGE_GAP_PX,
    );
    const availableBelow = Math.max(
      0,
      viewportHeight - toggleRect.bottom - FILTER_POPOVER_ANCHOR_GAP_PX - FILTER_POPOVER_EDGE_GAP_PX,
    );
    const placeAbove = availableBelow < Math.min(FILTER_POPOVER_MIN_HEIGHT_PX, dropdownRect.height)
      && availableAbove > availableBelow;
    const availableSpace = placeAbove ? availableAbove : availableBelow;

    if (placeAbove) {
      filterDropdown.dataset.placement = "above";
    }

    const maxHeight = Math.min(
      FILTER_POPOVER_MAX_HEIGHT_PX,
      Math.max(120, Math.floor(availableSpace)),
      Math.max(120, Math.floor(viewportHeight - FILTER_POPOVER_EDGE_GAP_PX * 2)),
    );
    if (dropdownRect.height > maxHeight) {
      filterDropdown.style.maxHeight = `${maxHeight}px`;
    }
  };

  const open = () => {
    if (isOpen()) {
      return;
    }

    clearTimers();
    filterDropdown.hidden = false;
    filterDropdown.dataset.state = "closed";
    filterDropdown.style.removeProperty("max-height");
    delete filterDropdown.dataset.placement;
    positionPopoverForViewport();
    filterToggle.setAttribute("aria-expanded", "true");

    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      filterDropdown.dataset.state = "opening";
      stateTimer = window.setTimeout(
        () => {
          stateTimer = 0;
          if (!filterDropdown.hidden) {
            filterDropdown.dataset.state = "open";
          }
        },
        prefersReducedMotion() ? 0 : FILTER_DROPDOWN_OPEN_DURATION_MS,
      );
    });
  };

  const close = ({ returnFocus = false, immediate = false } = {}) => {
    clearTimers();
    filterToggle.setAttribute("aria-expanded", "false");
    if (filterDropdown.hidden) {
      filterDropdown.dataset.state = "closed";
      if (returnFocus) {
        filterToggle.focus();
      }
      return;
    }

    filterDropdown.dataset.state = "closing";
    stateTimer = window.setTimeout(
      () => {
        stateTimer = 0;
        filterDropdown.hidden = true;
        filterDropdown.dataset.state = "closed";
        filterDropdown.style.removeProperty("max-height");
        delete filterDropdown.dataset.placement;
        if (returnFocus) {
          filterToggle.focus();
        }
      },
      immediate || prefersReducedMotion() ? 0 : FILTER_DROPDOWN_CLOSE_DURATION_MS,
    );
  };

  const repositionOpenPopover = () => {
    if (isOpen()) {
      positionPopoverForViewport();
    }
  };
  window.addEventListener("resize", repositionOpenPopover);
  window.visualViewport?.addEventListener("resize", repositionOpenPopover);

  return {
    close,
    isOpen,
    open,
  };
}
