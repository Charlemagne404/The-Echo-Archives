export function initializeAccordionList({ itemSelector, buttonSelector }) {
  const items = Array.from(document.querySelectorAll(itemSelector));

  if (items.length === 0) {
    return;
  }

  function setItemExpanded(item, expanded) {
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const button = item.querySelector(buttonSelector);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const panelId = button.getAttribute("aria-controls");
    if (!panelId) {
      return;
    }

    const panel = document.getElementById(panelId);
    if (!panel) {
      return;
    }

    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
    item.classList.toggle("is-open", expanded);
  }

  items.forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const button = item.querySelector(buttonSelector);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    setItemExpanded(item, button.getAttribute("aria-expanded") === "true");

    button.addEventListener("click", () => {
      const shouldExpand = button.getAttribute("aria-expanded") !== "true";

      items.forEach((otherItem) => {
        if (otherItem !== item) {
          setItemExpanded(otherItem, false);
        }
      });

      setItemExpanded(item, shouldExpand);
    });
  });
}
