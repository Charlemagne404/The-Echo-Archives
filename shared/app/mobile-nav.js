import { addMediaQueryListener } from "./utils.js";

const MOBILE_NAV_BREAKPOINT = "(max-width: 959px)";

export function initializeMobileNav() {
  const toggle = document.getElementById("siteNavToggle");
  const shell = document.getElementById("siteNavShell");
  const drawer = shell?.querySelector(".site-nav-drawer");
  const nav = shell?.querySelector(".site-mobile-drawer-nav");

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
  let lockedScrollY = 0;
  let previousBodyStyles = null;
  let previousDocumentStyles = null;

  const getFocusables = () => {
    const focusables = Array.from(drawer.querySelectorAll("a[href], button:not([disabled])")).filter(
      (node) => node instanceof HTMLElement && !node.hasAttribute("tabindex"),
    );
    const closeButton = drawer.querySelector("[data-site-nav-close]");

    return closeButton instanceof HTMLElement && focusables.includes(closeButton)
      ? [closeButton, ...focusables.filter((node) => node !== closeButton)]
      : focusables;
  };

  const isMobile = () => mediaQuery.matches;

  const lockBackgroundScroll = () => {
    if (previousBodyStyles || !isMobile()) {
      return;
    }

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
    if (!previousBodyStyles || !previousDocumentStyles) {
      return;
    }

    document.body.style.overflow = previousBodyStyles.overflow;
    document.body.style.position = previousBodyStyles.position;
    document.body.style.top = previousBodyStyles.top;
    document.body.style.width = previousBodyStyles.width;
    document.documentElement.style.overflow = previousDocumentStyles.overflow;
    previousBodyStyles = null;
    previousDocumentStyles = null;
    window.scrollTo(0, lockedScrollY);
  };

  const syncInteractiveState = () => {
    shell.dataset.state = isOpen ? "open" : "closed";
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close site navigation" : "Open site navigation");
    document.body.classList.toggle("site-nav-open", isMobile() && isOpen);
    shell.setAttribute("aria-hidden", String(isMobile() ? !isOpen : false));

    if (isMobile() && isOpen) {
      lockBackgroundScroll();
    } else {
      unlockBackgroundScroll();
    }

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

    // Safari does not consistently focus buttons when they are clicked, so the
    // active element may still be <body>. Opening always originates from this
    // toggle; restore focus there when the drawer closes.
    returnFocusTarget = toggle;
    isOpen = true;
    syncInteractiveState();

    const [firstFocusable] = getFocusables();
    firstFocusable?.focus();
    window.requestAnimationFrame(() => {
      const [currentFirstFocusable] = getFocusables();
      currentFirstFocusable?.focus();
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

  addMediaQueryListener(mediaQuery, () => {
    closeNav({ restoreFocus: false });
    syncInteractiveState();
  });

  syncInteractiveState();
}
