export function createCollectionFocusController({ collectionViewport, cards, sheenShiftPx }) {
  let interactionCard = null;

  function syncCollectionFocus() {
    const viewportRect = collectionViewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;
    const maxDistance = Math.max(viewportRect.width / 2, 1);
    let strongestCard = null;
    let strongestFocus = -1;

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const signedDistance = cardRect.left + cardRect.width / 2 - viewportCenter;
      const focusValue = Math.max(0, 1 - Math.abs(signedDistance) / maxDistance);
      const focusWeight = focusValue ** 1.65;
      const offsetRatio = Math.max(-1, Math.min(1, signedDistance / maxDistance));
      card.style.setProperty("--collection-focus", focusValue.toFixed(4));
      card.style.setProperty("--collection-focus-weight", focusWeight.toFixed(4));
      card.style.setProperty("--collection-offset-from-center", offsetRatio.toFixed(4));
      card.style.setProperty("--collection-sheen-shift", `${(offsetRatio * sheenShiftPx).toFixed(2)}px`);
      if (focusValue > strongestFocus) {
        strongestFocus = focusValue;
        strongestCard = card;
      }
    });

    cards.forEach((card) => {
      card.classList.toggle("is-center-weighted", card === strongestCard && strongestFocus > 0);
    });
  }

  function setInteractionCard(card) {
    if (interactionCard === card) {
      return;
    }

    interactionCard?.classList.remove("is-interaction-boosted");
    interactionCard = card instanceof HTMLAnchorElement ? card : null;
    interactionCard?.classList.add("is-interaction-boosted");
    syncCollectionFocus();
  }

  return {
    getInteractionCard: () => interactionCard,
    setInteractionCard,
    syncCollectionFocus,
  };
}
