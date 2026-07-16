export function createStickyBrowseVisibilityController({
  elements,
  state,
  stickyBrowseController,
  stickyFilterDropdownController,
}) {
  let isBrowseHeroPast = false;
  let lastScrollY = window.scrollY;
  let scrollDirection = "down";
  let scrollFrame = 0;
  let syncFrame = 0;
  let observer = null;

  const sync = () => {
    const shouldKeepVisible =
      state.query ||
      stickyBrowseController.isStickySearchFocused() ||
      stickyFilterDropdownController.isOpen();
    stickyBrowseController.setStickyBrowseVisibility(
      isBrowseHeroPast &&
        (shouldKeepVisible || !stickyBrowseController.usesMobileStickyLayout() || scrollDirection === "up"),
    );
  };

  const queueSync = () => {
    if (syncFrame) {
      return;
    }

    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      sync();
    });
  };

  const handleScroll = () => {
    if (scrollFrame) {
      return;
    }

    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const nextScrollY = window.scrollY;
      if (Math.abs(nextScrollY - lastScrollY) >= 4) {
        scrollDirection = nextScrollY < lastScrollY ? "up" : "down";
        lastScrollY = nextScrollY;
      }
      sync();
    });
  };

  const handleStickySearchFocus = () => {
    stickyBrowseController.handleStickySearchFocus();
    sync();
  };

  const handleStickySearchBlur = () => {
    stickyBrowseController.handleStickySearchBlur();
    queueSync();
  };

  const handleStickyFilterToggle = () => {
    queueSync();
  };

  return {
    bind() {
      elements.stickySearchInput.addEventListener("focus", handleStickySearchFocus);
      elements.stickySearchInput.addEventListener("blur", handleStickySearchBlur);
      elements.stickyFilterToggle.addEventListener("click", handleStickyFilterToggle);
      window.addEventListener("scroll", handleScroll, { passive: true });
    },
    destroy() {
      elements.stickySearchInput.removeEventListener("focus", handleStickySearchFocus);
      elements.stickySearchInput.removeEventListener("blur", handleStickySearchBlur);
      elements.stickyFilterToggle.removeEventListener("click", handleStickyFilterToggle);
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrame) {
        window.cancelAnimationFrame(scrollFrame);
      }
      if (syncFrame) {
        window.cancelAnimationFrame(syncFrame);
      }
      observer?.disconnect();
    },
    observe() {
      if (!("IntersectionObserver" in window)) {
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          isBrowseHeroPast = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
          sync();
        },
        { threshold: 0 },
      );
      observer.observe(elements.heroShell);
    },
    queueSync,
    sync,
  };
}
