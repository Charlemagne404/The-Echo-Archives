import { DEFAULT_FALLBACK_COVER_IMAGE } from "./constants.js";

function stripQuery(value = "") {
  return String(value || "").split("?", 1)[0];
}

export function resolveImageSrc(value = "", fallbackSrc = DEFAULT_FALLBACK_COVER_IMAGE) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallbackSrc;
  }

  if (/^(?:https?:)?\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
    return normalized;
  }

  return `/${normalized.replace(/^\/+/, "")}`;
}

function getCoverVariants(show) {
  return (Array.isArray(show?.coverVariants) ? show.coverVariants : [])
    .map((entry) => ({ src: resolveImageSrc(entry?.src, ""), width: Number(entry?.width) }))
    .filter((entry) => entry.src && [320, 640].includes(entry.width))
    .sort((left, right) => left.width - right.width);
}

export function getPreferredCoverSource(show, preferredWidth = 320) {
  const variants = getCoverVariants(show);
  const exact = variants.find((variant) => variant.width === preferredWidth);
  const fallback = preferredWidth <= 320 ? variants[0] : variants[variants.length - 1];
  return exact?.src || fallback?.src || show?.imageSrc || resolveImageSrc(show?.cover);
}

export function getResponsiveImageSource(show, sizes = "(max-width: 560px) 50vw, 320px") {
  const variants = getCoverVariants(show);
  return {
    src: variants[0]?.src || show?.imageSrc || resolveImageSrc(show?.cover),
    srcset: variants.map((variant) => `${variant.src} ${variant.width}w`).join(", "),
    sizes: variants.length > 0 ? sizes : "",
  };
}

export function configureShowImageElement(image, show, options = {}) {
  if (!(image instanceof HTMLImageElement)) {
    return image;
  }

  const { sizes, ...imageOptions } = options;
  const source = getResponsiveImageSource(show, sizes);
  if (source.srcset) {
    image.srcset = source.srcset;
    image.sizes = source.sizes;
  } else {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
  }
  image.src = source.src;

  return configureImageElement(image, imageOptions);
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
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
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

  if (!String(image.getAttribute("src") || "").trim()) {
    image.src = fallbackSrc;
    image.classList.add("is-image-fallback");
    image.dataset.imageFallbackApplied = "true";
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
