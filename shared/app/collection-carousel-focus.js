export function createCollectionFocusController({ collectionViewport, cards, sheenShiftPx }) {
  let interactionCard = null;
  let centerWeightedCard = null;

  function setStylePropertyIfChanged(card, property, value) {
    if (card.style.getPropertyValue(property) !== value) {
      card.style.setProperty(property, value);
    }
  }

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
      setStylePropertyIfChanged(card, "--collection-focus", focusValue.toFixed(4));
      setStylePropertyIfChanged(card, "--collection-focus-weight", focusWeight.toFixed(4));
      setStylePropertyIfChanged(card, "--collection-offset-from-center", offsetRatio.toFixed(4));
      setStylePropertyIfChanged(card, "--collection-sheen-shift", `${(offsetRatio * sheenShiftPx).toFixed(2)}px`);
      if (focusValue > strongestFocus) {
        strongestFocus = focusValue;
        strongestCard = card;
      }
    });

    const nextCenterWeightedCard = strongestFocus > 0 ? strongestCard : null;
    if (centerWeightedCard !== nextCenterWeightedCard) {
      centerWeightedCard?.classList.remove("is-center-weighted");
      centerWeightedCard = nextCenterWeightedCard;
      centerWeightedCard?.classList.add("is-center-weighted");
    }
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
