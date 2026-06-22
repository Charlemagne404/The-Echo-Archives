import { initializeCollectionCarousel } from "../../collection-carousel.js";
import { createCollectionCard } from "../../render-collections.js";

export function renderCollectionsRail({
  featuredCollections,
  showMap,
  collectionsSection,
  collectionCarousel,
  collectionViewport,
  collectionGrid,
  collectionPrev,
  collectionNext,
  currentControls,
}) {
  collectionGrid.textContent = "";
  collectionsSection.hidden = featuredCollections.length === 0;
  currentControls?.destroy();
  let nextControls = null;
  collectionPrev.hidden = true;
  collectionNext.hidden = true;

  if (featuredCollections.length === 0) {
    return null;
  }

  const carouselGroups = featuredCollections.length > 1 ? [0, 1, 2] : [1];
  carouselGroups.forEach((groupIndex) => {
    featuredCollections.forEach((collection, index) => {
      const card = createCollectionCard(collection, index, showMap, {
        isClone: featuredCollections.length > 1 && groupIndex !== 1,
      });
      collectionGrid.appendChild(card);
    });
  });

  if (featuredCollections.length > 1) {
    collectionPrev.hidden = false;
    collectionNext.hidden = false;
    nextControls = initializeCollectionCarousel({
      featuredCollections,
      collectionCarousel,
      collectionViewport,
      collectionGrid,
      collectionPrev,
      collectionNext,
    });
  }

  return nextControls;
}
