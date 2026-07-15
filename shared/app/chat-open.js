import { chatContainer, toggleBtn, userInput } from "./constants.js";

const CHAT_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let chatReturnFocusTarget = null;
const chatBackgroundStates = new Map();
const compactChatQuery = window.matchMedia("(max-width: 959px)");

function getChatFocusableElements() {
  if (!chatContainer) {
    return [];
  }

  return Array.from(chatContainer.querySelectorAll(CHAT_FOCUSABLE_SELECTOR)).filter((node) => {
    if (!(node instanceof HTMLElement) || node.closest("[hidden]")) {
      return false;
    }

    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function syncChatInteractivity(isOpen) {
  if (!chatContainer) {
    return;
  }

  if ("inert" in chatContainer) {
    chatContainer.inert = !isOpen;
  }

  Array.from(chatContainer.querySelectorAll(CHAT_FOCUSABLE_SELECTOR)).forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    if (isOpen) {
      const previousTabIndex = node.dataset.chatPreviousTabIndex;
      if (previousTabIndex === "") {
        node.removeAttribute("tabindex");
      } else if (previousTabIndex !== undefined) {
        node.setAttribute("tabindex", previousTabIndex);
      } else if (node.getAttribute("tabindex") === "-1") {
        node.removeAttribute("tabindex");
      }
      delete node.dataset.chatPreviousTabIndex;
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(node.dataset, "chatPreviousTabIndex")) {
      node.dataset.chatPreviousTabIndex = node.getAttribute("tabindex") ?? "";
    }
    node.setAttribute("tabindex", "-1");
  });
}

function restoreChatFocus() {
  if (chatReturnFocusTarget instanceof HTMLElement && chatReturnFocusTarget.isConnected) {
    chatReturnFocusTarget.focus();
  }

  chatReturnFocusTarget = null;
}

function syncChatBackground(isOpen) {
  const shouldLockBackground = isOpen && compactChatQuery.matches;

  if (shouldLockBackground) {
    Array.from(document.body.children).forEach((node) => {
      if (
        !(node instanceof HTMLElement) ||
        node === chatContainer ||
        node.tagName === "SCRIPT" ||
        node.classList.contains("archive-toast-stack")
      ) {
        return;
      }
      if (!chatBackgroundStates.has(node)) {
        chatBackgroundStates.set(node, {
          ariaHidden: node.getAttribute("aria-hidden"),
          inert: node.inert,
        });
      }
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
    return;
  }

  chatBackgroundStates.forEach((state, node) => {
    node.inert = state.inert;
    if (state.ariaHidden === null) {
      node.removeAttribute("aria-hidden");
    } else {
      node.setAttribute("aria-hidden", state.ariaHidden);
    }
  });
  chatBackgroundStates.clear();
}

export function initializeChatOpenState() {
  syncChatInteractivity(false);
  compactChatQuery.addEventListener("change", () => {
    syncChatBackground(Boolean(chatContainer?.classList.contains("is-open")));
  });
}

export function trapChatFocus(event) {
  const focusableElements = getChatFocusableElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    chatContainer?.focus();
    return;
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (!chatContainer.contains(activeElement)) {
    event.preventDefault();
    firstFocusable.focus();
    return;
  }

  if (event.shiftKey && activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus();
    return;
  }

  if (!event.shiftKey && activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
  }
}

export function setChatOpen(isOpen, { restoreFocus = !isOpen } = {}) {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  const wasOpen = chatContainer.classList.contains("is-open");
  if (isOpen && !wasOpen) {
    chatReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : toggleBtn;
  }

  chatContainer.classList.toggle("is-open", isOpen);
  chatContainer.setAttribute("aria-hidden", String(!isOpen));
  syncChatInteractivity(isOpen);
  document.body?.classList.toggle("chat-panel-open", isOpen);
  syncChatBackground(isOpen);
  toggleBtn.setAttribute("aria-expanded", String(isOpen));
  window.dispatchEvent(new CustomEvent("echo:chat-open-change", { detail: { isOpen } }));

  if (isOpen) {
    window.requestAnimationFrame(() => userInput?.focus());
  } else if (restoreFocus) {
    restoreChatFocus();
  } else {
    chatReturnFocusTarget = null;
  }
}
