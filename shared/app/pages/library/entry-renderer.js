import { createShowHref } from "../../urls.js";
import { STATE_LABELS, STATE_ORDER } from "../../library/constants.js";
import { makeElement } from "./library-dom.js";

function appendStateOptions(select, selectedState) {
  STATE_ORDER.forEach((state) => {
    const option = makeElement("option", "", STATE_LABELS[state]);
    option.value = state;
    option.selected = state === selectedState;
    select.append(option);
  });
}

function appendPrivateRatingControl(card, entry, title) {
  const field = makeElement("label", "library-entry-field library-private-rating-field");
  field.append(makeElement("span", "", "Your private rating"));
  const select = makeElement("select", "library-entry-rating");
  select.dataset.libraryRatingSelect = entry.showId;
  select.setAttribute("aria-label", `Your private rating for ${title}`);
  const noRating = makeElement("option", "", "No private rating");
  noRating.value = "";
  noRating.selected = !Object.hasOwn(entry, "rating");
  select.append(noRating);
  for (let rating = 1; rating <= 5; rating += 1) {
    const option = makeElement("option", "", `${rating} of 5 stars`);
    option.value = String(rating);
    option.selected = entry.rating === rating;
    select.append(option);
  }
  field.append(select);
  card.append(field, makeElement("p", "library-private-rating-note", "Private to this browser. This never submits a Community Rating."));
}

export function renderEntryCard(entry, show, unresolved = false) {
  const card = makeElement("article", `library-entry-card${unresolved ? " is-unresolved" : ""}`);
  card.dataset.libraryShowId = entry.showId;

  if (show?.imageSrc || show?.cover) {
    const image = makeElement("img", "library-entry-cover");
    image.src = show.imageSrc || `/${String(show.cover).replace(/^\/+/, "")}`;
    image.alt = show.imageAlt || show.coverAlt || `${show.title || "Show"} cover art`;
    image.width = 320;
    image.height = 320;
    image.loading = "lazy";
    image.decoding = "async";
    card.append(image);
  }

  const copy = makeElement("div", "library-entry-copy");
  const heading = makeElement("h3");
  const title = show?.title || entry.titleSnapshot || entry.showId;
  if (show) {
    const link = makeElement("a", "library-entry-title", title);
    link.href = createShowHref(show.id);
    heading.append(link);
  } else {
    heading.append(makeElement("span", "library-entry-title", title));
  }
  copy.append(heading);

  if (unresolved) {
    copy.append(makeElement("p", "library-unresolved-note", "This ID is not in the current public catalogue. It is kept as-is; Echo will not guess a replacement."));
    copy.append(makeElement("code", "library-unresolved-id", entry.showId));
  } else {
    const details = [
      ...(Array.isArray(show?.genres) ? show.genres.slice(0, 2) : []),
      ...(Array.isArray(show?.tags) ? show.tags.slice(0, 2) : []),
    ];
    if (details.length) copy.append(makeElement("p", "library-entry-metadata", [...new Set(details)].join(" · ")));
  }
  card.append(copy);

  const stateField = makeElement("label", "library-entry-field");
  stateField.append(makeElement("span", "", "Library state"));
  const stateSelect = makeElement("select", "library-entry-state");
  stateSelect.dataset.libraryStateSelect = entry.showId;
  stateSelect.setAttribute("aria-label", `Library state for ${title}`);
  appendStateOptions(stateSelect, entry.state);
  stateField.append(stateSelect);
  card.append(stateField);
  appendPrivateRatingControl(card, entry, title);

  const remove = makeElement("button", "library-entry-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = entry.showId;
  remove.setAttribute("aria-label", `Remove ${title} from your Library`);
  card.append(remove);
  return card;
}
