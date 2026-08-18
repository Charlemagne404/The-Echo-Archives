const ARCHIVIST_TOGGLE_MARKUP = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11.5C20 7.91015 16.6421 5 12.5 5H11.5C7.35786 5 4 7.91015 4 11.5C4 15.0899 7.35786 18 11.5 18H12.1L15.4 20.4C16.0615 20.8811 17 20.4086 17 19.5917V17.1593C18.7938 16.0442 20 13.9141 20 11.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"/>
    </svg>`;

export function initializeArchivistLauncher() {
  const isEnabled = document.body?.dataset.archivistEnabled === "true";
  if (!isEnabled) {
    document.querySelectorAll("#chat-toggle, [data-open-chat]").forEach((element) => element.remove());
    return;
  }

  if (document.getElementById("chat-toggle")) {
    return;
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "chat-toggle";
  toggleBtn.className = "chat-toggle-button";
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-label", "Ask the Archivist");
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.title = "Ask the Archivist";
  toggleBtn.innerHTML = ARCHIVIST_TOGGLE_MARKUP;

  document.getElementById("backToTop")?.before(toggleBtn);
  if (!toggleBtn.isConnected) {
    document.body.append(toggleBtn);
  }
}
