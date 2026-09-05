const { matchesEntityQuery } = globalThis.EchoArchiveEntities;

export async function initializeEntityDirectory() {
  const grid = document.querySelector(".entity-catalogue .podcast-card-grid");
  if (grid) {
    const shows = Array.from(grid.querySelectorAll("[data-podcast-id]")).map((node) => ({ id: node.dataset.podcastId }));
    const { syncCommunityCardBadges } = await import("../community.js");
    void syncCommunityCardBadges(grid, shows);
  }
  const input = document.getElementById("entitySearch");
  if (!input) return;
  const form = input.closest("form");
  const entries = Array.from(document.querySelectorAll("[data-entity-names]")).map((element) => {
    const [name, ...aliases] = JSON.parse(element.dataset.entityNames);
    return { element, name, aliases };
  });
  const update = () => {
    const query = input.value.trim();
    let count = 0;
    for (const entry of entries) {
      entry.element.hidden = Boolean(query) && !matchesEntityQuery(entry, query);
      if (!entry.element.hidden) count += 1;
    }
    document.getElementById("entityResults").textContent = `${count} ${count === 1 ? "creator, studio, or network" : "creators, studios, and networks"}${query ? " found" : " to explore"}.`;
    document.getElementById("entityEmpty").hidden = count > 0;
    document.querySelector("[data-entity-browse]").href = `/?q=${encodeURIComponent(query)}#archive`;
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(history.state, "", url);
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); update(); });
  input.addEventListener("input", update);
  document.querySelector("[data-entity-reset]").addEventListener("click", (event) => {
    event.preventDefault(); input.value = ""; update(); input.focus();
  });
  input.value = new URLSearchParams(window.location.search).get("q") || "";
  update();
}
