export function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (document.body.classList.contains("maintainer-page") || document.body.classList.contains("maintainer-import-page")) {
    return;
  }

  const { protocol, hostname } = window.location;
  const isSecureContext = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
  if (!isSecureContext) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The archive should stay fully usable without service worker registration.
    });
  });
}
