import { chatFootnote, userInput } from "../constants.js";

function applyChatCopy() {
  const inputLabel = document.querySelector('label[for="userInput"]');
  const isCreatorsContext =
    document.body.classList.contains("for-creators-page") || document.body.classList.contains("creator-standards-page");
  const isHelpContext = document.body.classList.contains("help-center-page");

  if (inputLabel) {
    inputLabel.textContent = isCreatorsContext
      ? "Ask about creator verification or archive standards"
      : isHelpContext
        ? "Ask about archive help or site issues"
        : "Ask about the archive or a show";
  }

  if (userInput) {
    userInput.placeholder = isCreatorsContext
      ? "Ask about creator verification, standards, or submissions"
      : isHelpContext
        ? "Ask about broken links, ratings, search, creator verified, or how the site works"
        : "Ask about the archive, a show, runtime, creators, or how the site works";
  }

  if (chatFootnote) {
    chatFootnote.textContent = isCreatorsContext
      ? "Ask how creator verification works, what stays editorially independent, or which submit path to use."
      : isHelpContext
        ? "Ask how to fix a broken link, what creator verified means, why a rating did not stick, or how to search better."
        : "Ask for a recommendation, a correction path, creator or runtime details, privacy help, or what creator verified means.";
  }
}

function getChatPageContext() {
  const params = new URLSearchParams(window.location.search);
  const pageType = getChatPageType();
  const id = params.get("id") || "";

  return {
    path: window.location.pathname,
    pageType,
    showId: pageType === "show" ? id : "",
    collectionId: pageType === "collection" ? id : "",
  };
}

function getChatPageType() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  function matchesRoute(cleanPath, legacyPath) {
    return path === cleanPath || path.endsWith(legacyPath);
  }

  if (document.body.classList.contains("show-page")) {
    return "show";
  }

  if (document.body.classList.contains("collection-page")) {
    return "collection";
  }

  if (document.body.classList.contains("collections-page")) {
    return "collections";
  }

  if (document.body.classList.contains("about-page")) {
    return "about";
  }

  if (document.body.classList.contains("submit-page")) {
    return "submit";
  }

  if (document.body.classList.contains("for-creators-page") || document.body.classList.contains("creator-standards-page")) {
    return "creators";
  }

  if (matchesRoute("/privacy", "/privacy.html") || matchesRoute("/cookies", "/cookies.html")) {
    return "privacy";
  }

  if (matchesRoute("/terms", "/terms.html") || matchesRoute("/copyright", "/copyright.html")) {
    return "terms";
  }

  if (matchesRoute("/supporters", "/supporters.html")) {
    return "supporters";
  }

  if (matchesRoute("/help-center", "/help-center.html")) {
    return "help-center";
  }

  if (matchesRoute("/collections", "/collections.html")) {
    return "collections";
  }

  if (matchesRoute("/collection", "/collection.html")) {
    return "collection";
  }

  if (matchesRoute("/show", "/show.html")) {
    return "show";
  }

  if (matchesRoute("/about", "/about.html")) {
    return "about";
  }

  if (matchesRoute("/submit", "/submit.html")) {
    return "submit";
  }

  if (
    matchesRoute("/for-creators", "/for-creators.html") ||
    matchesRoute("/creator-standards", "/creator-standards.html")
  ) {
    return "creators";
  }

  return path === "/" || path.endsWith("/index.html") ? "home" : "unknown";
}

export { applyChatCopy, getChatPageContext };
