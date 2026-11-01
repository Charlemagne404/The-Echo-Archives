const FILTER_DROPDOWN_OPEN_DURATION_MS = 190;
const FILTER_DROPDOWN_CLOSE_DURATION_MS = 150;
const FILTER_POPOVER_EDGE_GAP_PX = 12;
const FILTER_POPOVER_ANCHOR_GAP_PX = 10;
const FILTER_POPOVER_MIN_HEIGHT_PX = 280;
const FILTER_POPOVER_MAX_HEIGHT_PX = 300;
const MOBILE_FILTER_MODAL_QUERY = "(max-width: 560px)";

export function initializeFilterDropdownController({ filterDropdown, filterToggle }) {
  let stateTimer = 0;
  let openFrame = 0;
  let portalPlaceholder = null;
  let modalActive = false;
  let lockedScrollY = 0;
  let previousBodyStyles = null;
  let previousDocumentStyles = null;
  const backgroundStates = new Map();
  const mobileQuery = window.matchMedia(MOBILE_FILTER_MODAL_QUERY);

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

  const closeButton = document.createElement("button");
  closeButton.className = "filter-sheet-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close filters");
  closeButton.textContent = "Close";
  filterDropdown.prepend(closeButton);

  const backdrop = document.createElement("div");
  backdrop.className = "filter-sheet-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;

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
    if (mobileQuery.matches) return;

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

  const setBackgroundInert = (inert) => {
    if (inert) {
      Array.from(document.body.children).forEach((node) => {
        if (!(node instanceof HTMLElement) || node === filterDropdown || node === backdrop) return;
        if (!backgroundStates.has(node)) {
          backgroundStates.set(node, {
            ariaHidden: node.getAttribute("aria-hidden"),
            inert: node.inert,
          });
        }
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
      });
      return;
    }

    backgroundStates.forEach((state, node) => {
      node.inert = state.inert;
      if (state.ariaHidden === null) {
        node.removeAttribute("aria-hidden");
      } else {
        node.setAttribute("aria-hidden", state.ariaHidden);
      }
    });
    backgroundStates.clear();
  };

  const lockBackgroundScroll = () => {
    if (previousBodyStyles) return;

    lockedScrollY = window.scrollY;
    previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    previousDocumentStyles = {
      overflow: document.documentElement.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = "100%";
  };

  const unlockBackgroundScroll = () => {
    if (!previousBodyStyles || !previousDocumentStyles) return;

    document.body.style.overflow = previousBodyStyles.overflow;
    document.body.style.position = previousBodyStyles.position;
    document.body.style.top = previousBodyStyles.top;
    document.body.style.width = previousBodyStyles.width;
    document.documentElement.style.overflow = previousDocumentStyles.overflow;
    previousBodyStyles = null;
    previousDocumentStyles = null;
    window.scrollTo(0, lockedScrollY);
  };

  const enterMobileModal = () => {
    if (modalActive || !mobileQuery.matches) return;
    if (!portalPlaceholder && filterDropdown.parentNode) {
      portalPlaceholder = document.createComment("filter-dropdown-portal");
      filterDropdown.parentNode.insertBefore(portalPlaceholder, filterDropdown);
    }

    document.body.append(backdrop, filterDropdown);
    backdrop.hidden = false;
    filterDropdown.dataset.modal = "true";
    filterDropdown.setAttribute("role", "dialog");
    filterDropdown.setAttribute("aria-modal", "true");
    document.body.classList.add("filter-sheet-open");
    setBackgroundInert(true);
    lockBackgroundScroll();
    modalActive = true;
    closeButton.focus({ preventScroll: true });
  };

  const exitMobileModal = () => {
    if (!modalActive) return;
    modalActive = false;
    backdrop.hidden = true;
    backdrop.remove();
    if (portalPlaceholder?.parentNode) {
      portalPlaceholder.parentNode.insertBefore(filterDropdown, portalPlaceholder);
      portalPlaceholder.remove();
    }
    portalPlaceholder = null;
    filterDropdown.removeAttribute("data-modal");
    filterDropdown.setAttribute("role", "group");
    filterDropdown.removeAttribute("aria-modal");
    document.body.classList.remove("filter-sheet-open");
    setBackgroundInert(false);
    unlockBackgroundScroll();
  };

  const getFocusables = () => Array.from(filterDropdown.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((node) => {
    if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute("aria-hidden") === "true") return false;
    const styles = window.getComputedStyle(node);
    return styles.display !== "none" && styles.visibility !== "hidden" && node.getClientRects().length > 0;
  });

  const open = () => {
    if (isOpen()) return;

    clearTimers();
    filterDropdown.hidden = false;
    filterDropdown.dataset.state = "closed";
    filterDropdown.style.removeProperty("max-height");
    delete filterDropdown.dataset.placement;
    if (mobileQuery.matches) {
      enterMobileModal();
    } else {
      positionPopoverForViewport();
    }
    filterToggle.setAttribute("aria-expanded", "true");

    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      filterDropdown.dataset.state = "opening";
      stateTimer = window.setTimeout(
        () => {
          stateTimer = 0;
          if (!filterDropdown.hidden) {
            filterDropdown.dataset.state = "open";
            if (modalActive) closeButton.focus({ preventScroll: true });
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
      exitMobileModal();
      if (returnFocus) filterToggle.focus();
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
        exitMobileModal();
        if (returnFocus) filterToggle.focus();
      },
      immediate || prefersReducedMotion() ? 0 : FILTER_DROPDOWN_CLOSE_DURATION_MS,
    );
  };

  const repositionOpenPopover = () => {
    if (isOpen()) {
      if (mobileQuery.matches) enterMobileModal();
      else {
        exitMobileModal();
        positionPopoverForViewport();
      }
    }
  };
  window.addEventListener("resize", repositionOpenPopover);
  window.visualViewport?.addEventListener("resize", repositionOpenPopover);
  mobileQuery.addEventListener("change", repositionOpenPopover);

  closeButton.addEventListener("click", () => close({ returnFocus: true }));
  backdrop.addEventListener("pointerdown", () => close({ returnFocus: true }));
  filterDropdown.addEventListener("keydown", (event) => {
    if (!modalActive || event.key !== "Tab") return;
    const focusables = getFocusables();
    if (focusables.length === 0) {
      event.preventDefault();
      closeButton.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!filterDropdown.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  });

  return {
    close,
    isOpen,
    open,
  };
}
