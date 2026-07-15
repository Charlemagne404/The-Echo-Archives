let initialized = false;

export function initializeViewportMetrics() {
  if (initialized) {
    return;
  }
  initialized = true;

  const root = document.documentElement;
  let animationFrame = 0;

  const updateMetrics = () => {
    animationFrame = 0;
    const viewport = window.visualViewport;
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const keyboardInset = Math.max(0, Math.round(window.innerHeight - height - offsetTop));

    root.style.setProperty("--visual-viewport-height", `${height}px`);
    root.style.setProperty("--visual-viewport-offset-top", `${offsetTop}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
  };

  const scheduleUpdate = () => {
    if (animationFrame) {
      return;
    }
    animationFrame = window.requestAnimationFrame(updateMetrics);
  };

  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleUpdate, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleUpdate, { passive: true });
  updateMetrics();
}
