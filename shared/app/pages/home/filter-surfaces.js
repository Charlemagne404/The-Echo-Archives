import { initializeFilterDropdownController } from "./filter-dropdown.js";
import { createFilterMenuState, openFilterMenuBucket, renderFilterMenu, resetFilterMenuState } from "./filters.js";

export function createHomeFilterSurfaceController({
  elements,
  filters,
  filterMenuBuckets,
  filterOptionsByGroup,
  onToggleFilter,
  onClearBucketFilters,
}) {
  const heroFilterDropdownController = initializeFilterDropdownController({
    filterDropdown: elements.filterDropdown,
    filterToggle: elements.filterToggle,
  });
  const stickyFilterDropdownController = initializeFilterDropdownController({
    filterDropdown: elements.stickyFilterDropdown,
    filterToggle: elements.stickyFilterToggle,
  });
  const surfaces = [
    {
      controller: heroFilterDropdownController,
      dropdown: elements.filterDropdown,
      optionGrid: elements.filterOptionGrid,
      toggle: elements.filterToggle,
      menuState: createFilterMenuState(),
    },
    {
      controller: stickyFilterDropdownController,
      dropdown: elements.stickyFilterDropdown,
      optionGrid: elements.stickyFilterOptionGrid,
      toggle: elements.stickyFilterToggle,
      menuState: createFilterMenuState(),
    },
  ];

  function focusTarget(surface, selector) {
    const target = surface.optionGrid.querySelector(selector);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  }

  function renderSurface(surface) {
    renderFilterMenu({
      filterDropdown: surface.dropdown,
      filterOptionGrid: surface.optionGrid,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters,
      menuState: surface.menuState,
      onOpenBucket: (bucketId) => {
        openFilterMenuBucket(surface.menuState, bucketId);
        renderSurface(surface);
        const bucket = filterMenuBuckets.find((entry) => entry.id === bucketId);
        focusTarget(surface, bucket?.searchable ? ".filter-tag-search-input" : ".filter-option");
      },
      onBackToLauncher: () => {
        const previousBucketId = surface.menuState.activeBucketId;
        resetFilterMenuState(surface.menuState);
        renderSurface(surface);
        focusTarget(surface, `[data-filter-bucket-id="${previousBucketId}"]`);
      },
      onToggleFilter,
      onClearBucketFilters,
    });
  }

  function closeOtherDropdowns(activeSurface) {
    surfaces.forEach((surface) => {
      if (surface !== activeSurface && surface.controller.isOpen()) {
        surface.controller.close();
      }
    });
  }

  return {
    stickyFilterDropdownController,
    renderAll() {
      surfaces.forEach(renderSurface);
    },
    bindToggles() {
      surfaces.forEach((surface) => {
        surface.toggle.addEventListener("click", () => {
          if (surface.controller.isOpen()) {
            surface.controller.close();
            return;
          }

          closeOtherDropdowns(surface);
          resetFilterMenuState(surface.menuState);
          renderSurface(surface);
          surface.controller.open();
        });
      });
    },
    closeOnOutsidePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      surfaces.forEach((surface) => {
        if (surface.controller.isOpen() && !surface.dropdown.contains(target) && !surface.toggle.contains(target)) {
          surface.controller.close();
        }
      });
    },
    closeOnEscape(event) {
      const openSurface = surfaces.find((surface) => surface.controller.isOpen());
      if (event.key !== "Escape" || !openSurface) {
        return false;
      }

      event.preventDefault();
      openSurface.controller.close({ returnFocus: true });
      return true;
    },
  };
}
