import { DEFAULT_FALLBACK_COVER_IMAGE } from "./constants.js";

function stripQuery(value = "") {
  return String(value || "").split("?", 1)[0];
}

function shouldPreferEagerLoading(image) {
  return Boolean(
    image.closest(".detail-cover-card") ||
      image.closest(".collection-detail-art") ||
      image.closest(".hero-panel") ||
      image.dataset.imageLoading === "eager",
  );
}

function bindFallback(image, fallbackSrc) {
  if (!(image instanceof HTMLImageElement) || image.dataset.imageFallbackBound === "true") {
    return;
  }

  image.dataset.imageFallbackBound = "true";
  image.dataset.imageFallbackSrc = fallbackSrc;
  image.addEventListener("error", () => {
    const nextFallback = image.dataset.imageFallbackSrc || fallbackSrc;
    if (!nextFallback || image.dataset.imageFallbackApplied === "true") {
      return;
    }

    const current = stripQuery(image.currentSrc || image.src);
    const fallback = stripQuery(nextFallback);
    if (current === fallback) {
      return;
    }

    image.dataset.imageFallbackApplied = "true";
    image.classList.add("is-image-fallback");
    image.src = nextFallback;
  });
}

export function configureImageElement(
  image,
  { loading = "", decoding = "async", fallbackSrc = DEFAULT_FALLBACK_COVER_IMAGE, width = 0, height = 0, fetchPriority = "" } = {},
) {
  if (!(image instanceof HTMLImageElement)) {
    return image;
  }

  const resolvedLoading = loading || image.dataset.imageLoading || (shouldPreferEagerLoading(image) ? "eager" : "lazy");
  image.loading = resolvedLoading;
  image.decoding = decoding;
  if (width > 0) {
    image.width = width;
  }
  if (height > 0) {
    image.height = height;
  }
  if ("fetchPriority" in image) {
    image.fetchPriority = fetchPriority || (resolvedLoading === "eager" ? "high" : "auto");
  }

  bindFallback(image, fallbackSrc);
  image.dataset.managedImage = "true";
  return image;
}

export function initializeManagedImages(root = document) {
  const scope = root instanceof Document ? root : root instanceof HTMLElement ? root : document;
  scope.querySelectorAll("img").forEach((image) => {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    configureImageElement(image, {
      loading: image.getAttribute("loading") || "",
      decoding: image.getAttribute("decoding") || "async",
      width: Number.parseInt(image.getAttribute("width") || "0", 10) || 0,
      height: Number.parseInt(image.getAttribute("height") || "0", 10) || 0,
      fetchPriority: image.dataset.imageFetchPriority || image.getAttribute("fetchpriority") || "",
    });
  });
}
