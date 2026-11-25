import { STATE_LABELS, STATE_ORDER } from "./constants.js";

function makeElement(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function makeStatusNode() {
  const node = makeElement("span", "library-control-status");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  return node;
}

export function appendDetailStateOptions(select, currentState) {
  select.replaceChildren();
  const prompt = makeElement("option", "", currentState ? STATE_LABELS[currentState] : "Choose a state");
  prompt.value = currentState || "";
  prompt.disabled = !currentState;
  prompt.selected = true;
  select.append(prompt);
  STATE_ORDER.forEach((state) => {
    const option = makeElement("option", "", STATE_LABELS[state]);
    option.value = state;
    select.append(option);
  });
}

export function createDetailControl(showId, title) {
  const details = makeElement("details", "library-detail-control");
  details.dataset.libraryShowId = showId;
  details.dataset.libraryControl = "detail";
  details.dataset.libraryTitle = title;
  const summary = makeElement("summary", "library-card-summary", "Manage Library");
  summary.setAttribute("aria-label", `Manage ${title} in your Library`);
  details.append(summary);

  const panel = makeElement("div", "library-detail-panel");
  const stateLabel = makeElement("label", "library-detail-field");
  stateLabel.append(makeElement("span", "", "Library status"));
  const stateSelect = makeElement("select");
  stateSelect.dataset.libraryStateSelect = showId;
  stateSelect.setAttribute("aria-label", `Library status for ${title}`);
  appendDetailStateOptions(stateSelect, "");
  stateLabel.append(stateSelect);

  const ratingLabel = makeElement("label", "library-detail-field");
  ratingLabel.append(makeElement("span", "", "Private rating"));
  const ratingSelect = makeElement("select");
  ratingSelect.dataset.libraryRatingSelect = showId;
  ratingSelect.setAttribute("aria-label", `Private Library rating for ${title}`);
  const noRating = makeElement("option", "", "No private rating");
  noRating.value = "";
  ratingSelect.append(noRating);
  for (let rating = 1; rating <= 5; rating += 1) {
    const option = makeElement("option", "", `${rating} of 5`);
    option.value = String(rating);
    ratingSelect.append(option);
  }
  ratingLabel.append(ratingSelect);

  const ratingNote = makeElement(
    "p",
    "library-detail-rating-note",
    "Private ratings stay in this browser and are never submitted as a Community Rating.",
  );
  const hiddenMeaning = makeElement(
    "p",
    "library-hidden-meaning",
    "Hidden only changes your own Personal Discovery results. It does not hide this show from the public archive.",
  );
  hiddenMeaning.hidden = true;

  const preferenceLabel = makeElement("label", "library-personal-discovery-setting");
  const preference = document.createElement("input");
  preference.type = "checkbox";
  preference.dataset.libraryDiscoveryPreference = "true";
  preference.setAttribute("aria-label", "Use my Library in discovery");
  preference.setAttribute("aria-describedby", `library-personal-discovery-help-${showId}`);
  preferenceLabel.append(preference, makeElement("span", "", "Use my Library for Personal Discovery"));
  const preferenceHelp = makeElement(
    "p",
    "library-personal-discovery-help",
    "Uses your Library states and private ratings to refine your existing search on this browser.",
  );
  preferenceHelp.id = `library-personal-discovery-help-${showId}`;

  const remove = makeElement("button", "library-detail-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = showId;
  remove.hidden = true;
  const status = makeStatusNode();
  panel.append(stateLabel, ratingLabel, ratingNote, hiddenMeaning, preferenceLabel, preferenceHelp, remove, status);
  details.append(panel);
  return details;
}
