import { addMediaQueryListener } from "../../utils.js";

const FILTER_DROPDOWN_OPEN_DURATION_MS = 190;
const FILTER_DROPDOWN_CLOSE_DURATION_MS = 150;
const FILTER_SHEET_BREAKPOINT = "(max-width: 959px)";
const FILTER_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function initializeFilterDropdownController({ filterDropdown, filterToggle }) {
  let stateTimer = 0;
  let openFrame = 0;

  if (!(filterDropdown instanceof HTMLElement) || !(filterToggle instanceof HTMLButtonElement)) {
    return {
      close() {},
      isOpen() {
        return false;
      },
      isSheet() {
        return false;
      },
      open() {},
    };
  }

  const origin = filterDropdown.parentElement;
  const backdrop = origin?.querySelector(":scope > [data-filter-sheet-dismiss].filter-sheet-backdrop");
  const closeButtons = Array.from(filterDropdown.querySelectorAll("[data-filter-sheet-dismiss]")).filter(
    (node) => node instanceof HTMLButtonElement,
  );
  const mobileSheetQuery = window.matchMedia(FILTER_SHEET_BREAKPOINT);
  const backgroundStates = new Map();

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
  const isSheet = () => filterDropdown.dataset.filterPresentation === "sheet";

  const getFocusables = () =>
    Array.from(filterDropdown.querySelectorAll(FILTER_FOCUSABLE_SELECTOR)).filter((node) => {
      if (!(node instanceof HTMLElement) || node.closest("[hidden]")) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });

  const syncBodySheetState = () => {
    const hasOpenSheet = Array.from(document.querySelectorAll('[data-filter-presentation="sheet"]')).some(
      (node) => node instanceof HTMLElement && !node.hidden,
    );
    document.body.classList.toggle("filter-sheet-open", hasOpenSheet);
  };

  const setBackgroundInert = (inert) => {
    if (inert) {
      Array.from(document.body.children).forEach((node) => {
        if (!(node instanceof HTMLElement) || node === filterDropdown || node === backdrop || node.tagName === "SCRIPT") {
          return;
        }
        backgroundStates.set(node, {
          ariaHidden: node.getAttribute("aria-hidden"),
          inert: node.inert,
        });
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

  const moveToSheetLayer = () => {
    if (!(origin instanceof HTMLElement) || !(backdrop instanceof HTMLButtonElement)) {
      return false;
    }
    backdrop.hidden = false;
    filterDropdown.dataset.filterPresentation = "sheet";
    filterDropdown.setAttribute("role", "dialog");
    filterDropdown.setAttribute("aria-modal", "true");
    document.body.append(backdrop, filterDropdown);
    setBackgroundInert(true);
    return true;
  };

  const restoreDropdownLayer = () => {
    if (!(origin instanceof HTMLElement)) {
      return;
    }
    setBackgroundInert(false);
    if (backdrop instanceof HTMLButtonElement) {
      backdrop.hidden = true;
      origin.append(backdrop);
    }
    origin.append(filterDropdown);
    delete filterDropdown.dataset.filterPresentation;
    filterDropdown.removeAttribute("role");
    filterDropdown.removeAttribute("aria-modal");
  };

  const focusSheetStart = () => {
    const closeButton = filterDropdown.querySelector(".filter-sheet-close");
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.focus();
      return;
    }
    getFocusables()[0]?.focus();
  };

  const open = () => {
    if (isOpen()) {
      return;
    }

    clearTimers();
    const openedAsSheet = mobileSheetQuery.matches && moveToSheetLayer();
    filterDropdown.hidden = false;
    filterDropdown.dataset.state = "closed";
    filterToggle.setAttribute("aria-expanded", "true");
    syncBodySheetState();
    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      filterDropdown.dataset.state = "opening";
      if (openedAsSheet) {
        window.requestAnimationFrame(focusSheetStart);
      }
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
      restoreDropdownLayer();
      syncBodySheetState();
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
        restoreDropdownLayer();
        syncBodySheetState();
        if (returnFocus) {
          filterToggle.focus();
        }
      },
      immediate || prefersReducedMotion() ? 0 : FILTER_DROPDOWN_CLOSE_DURATION_MS,
    );
  };

  const trapSheetFocus = (event) => {
    if (!isOpen() || !isSheet() || event.key !== "Tab") {
      return;
    }
    const focusables = getFocusables();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!filterDropdown.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  filterDropdown.addEventListener("keydown", trapSheetFocus);
  closeButtons.forEach((button) => button.addEventListener("click", () => close({ returnFocus: true })));
  backdrop?.addEventListener("click", () => close({ returnFocus: true }));

  addMediaQueryListener(mobileSheetQuery, () => {
    if (isOpen()) {
      close({ returnFocus: true, immediate: true });
    }
  });

  return {
    close,
    isOpen,
    isSheet,
    open,
  };
}
