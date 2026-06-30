const MOBILE_NAV_BREAKPOINT = "(max-width: 780px)";

export function initializeMobileNav() {
  const toggle = document.getElementById("siteNavToggle");
  const shell = document.getElementById("siteNavShell");
  const drawer = shell?.querySelector(".site-nav-drawer");
  const nav = document.getElementById("sitePrimaryNav");

  if (
    !(toggle instanceof HTMLButtonElement) ||
    !(shell instanceof HTMLElement) ||
    !(drawer instanceof HTMLElement) ||
    !(nav instanceof HTMLElement)
  ) {
    return;
  }

  const closeButtons = Array.from(shell.querySelectorAll("[data-site-nav-close]")).filter(
    (node) => node instanceof HTMLButtonElement,
  );
  const navLinks = Array.from(nav.querySelectorAll("a"));
  const mediaQuery = window.matchMedia(MOBILE_NAV_BREAKPOINT);
  let isOpen = false;
  let returnFocusTarget = null;

  const getFocusables = () =>
    Array.from(drawer.querySelectorAll("a[href], button:not([disabled])")).filter(
      (node) => node instanceof HTMLElement && !node.hasAttribute("tabindex"),
    );

  const isMobile = () => mediaQuery.matches;

  const syncInteractiveState = () => {
    shell.dataset.state = isOpen ? "open" : "closed";
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close site navigation" : "Open site navigation");
    document.body.classList.toggle("site-nav-open", isMobile() && isOpen);

    const managedNodes = Array.from(drawer.querySelectorAll("a[href], button"));
    managedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || node === toggle) {
        return;
      }

      if (isMobile() && !isOpen) {
        node.setAttribute("tabindex", "-1");
      } else {
        node.removeAttribute("tabindex");
      }
    });
  };

  const closeNav = ({ restoreFocus = true } = {}) => {
    if (!isOpen) {
      syncInteractiveState();
      return;
    }

    isOpen = false;
    syncInteractiveState();

    if (restoreFocus && returnFocusTarget instanceof HTMLElement) {
      returnFocusTarget.focus();
    }

    returnFocusTarget = null;
  };

  const openNav = () => {
    if (!isMobile()) {
      closeNav({ restoreFocus: false });
      return;
    }

    returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
    isOpen = true;
    syncInteractiveState();

    window.requestAnimationFrame(() => {
      const [firstFocusable] = getFocusables();
      firstFocusable?.focus();
    });
  };

  toggle.addEventListener("click", () => {
    if (!isMobile()) {
      return;
    }

    if (isOpen) {
      closeNav();
      return;
    }

    openNav();
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => closeNav());
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobile()) {
        closeNav({ restoreFocus: false });
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!isMobile() || !isOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeNav();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusables = getFocusables();
    if (focusables.length === 0) {
      return;
    }

    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  });

  mediaQuery.addEventListener("change", () => {
    closeNav({ restoreFocus: false });
    syncInteractiveState();
  });

  syncInteractiveState();
}
