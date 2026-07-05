import { loadCollections, loadSearchIndex } from "../../data.js";
import { createRouteErrorSurface } from "../../route-error.js";
import { renderHomeErrorState } from "./loading.js";

export async function loadHomePageData(elements) {
  try {
    return await Promise.all([loadSearchIndex(), loadCollections()]);
  } catch (_error) {
    renderHomeErrorState(elements, () =>
      createRouteErrorSurface({
        title: "Archive data did not load",
        explanation: "Search, filters, and collection routes need the public catalog data before they can work.",
        primaryAction: { href: "/collections", label: "Browse collections" },
        secondaryAction: { href: "/help-center", label: "Get help" },
        onRetry: () => window.location.reload(),
      }),
    );
    return [null, null];
  }
}
