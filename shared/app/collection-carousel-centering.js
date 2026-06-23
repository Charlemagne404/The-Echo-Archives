export function getLoopProgress(left, start, width) {
  if (!width) {
    return 0;
  }

  return ((left - start) % width + width) % width;
}

export function getWrappedIndex(index, length) {
  return ((index % length) + length) % length;
}

export function getCardCenterPosition(card) {
  return card.offsetLeft + card.offsetWidth / 2;
}

export function getCenteredScrollLeft(card, viewport) {
  return getCardCenterPosition(card) - viewport.clientWidth / 2;
}

export function alignCardToViewportCenter(card, viewport, setViewportScroll) {
  const cardRect = card.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const residualOffset = cardRect.left + cardRect.width / 2 - (viewportRect.left + viewportRect.width / 2);

  if (Math.abs(residualOffset) > 0.25) {
    setViewportScroll(viewport.scrollLeft + residualOffset);
  }
}

export function getNearestCardIndex(cards, viewport) {
  if (!cards.length) {
    return 0;
  }

  const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  cards.forEach((card, index) => {
    const distance = Math.abs(getCardCenterPosition(card) - viewportCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}
