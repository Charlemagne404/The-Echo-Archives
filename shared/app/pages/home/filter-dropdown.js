import { addMediaQueryListener } from "../../utils.js";

const FILTER_DROPDOWN_OPEN_DURATION_MS = 190;
const FILTER_DROPDOWN_CLOSE_DURATION_MS = 150;

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
  const mobileSheetQuery = window.matchMedia("(max-width: 780px)");

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

  const syncBodySheetState = (open) => {
    document.body.classList.toggle("filter-sheet-open", open && mobileSheetQuery.matches);
  };

  const open = () => {
    if (isOpen()) {
      return;
    }

    clearTimers();
    filterDropdown.hidden = false;
    filterDropdown.dataset.state = "closed";
    filterToggle.setAttribute("aria-expanded", "true");
    syncBodySheetState(true);
    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      filterDropdown.dataset.state = "opening";
      stateTimer = window.setTimeout(() => {
        stateTimer = 0;
        if (!filterDropdown.hidden) {
          filterDropdown.dataset.state = "open";
        }
      }, FILTER_DROPDOWN_OPEN_DURATION_MS);
    });
  };

  const close = ({ returnFocus = false } = {}) => {
    clearTimers();
    filterToggle.setAttribute("aria-expanded", "false");
    if (filterDropdown.hidden) {
      filterDropdown.dataset.state = "closed";
      syncBodySheetState(false);
      if (returnFocus) {
        filterToggle.focus();
      }
      return;
    }

    filterDropdown.dataset.state = "closing";
    stateTimer = window.setTimeout(() => {
      stateTimer = 0;
      filterDropdown.hidden = true;
      filterDropdown.dataset.state = "closed";
      syncBodySheetState(false);
      if (returnFocus) {
        filterToggle.focus();
      }
    }, FILTER_DROPDOWN_CLOSE_DURATION_MS);
  };

  addMediaQueryListener(mobileSheetQuery, () => {
    syncBodySheetState(isOpen());
  });

  return {
    close,
    isOpen,
    open,
  };
}
