import { STATE_LABELS, STATE_ORDER } from "../../library/constants.js";
import { makeElement } from "./library-dom.js";

function appendCountList(target, counts) {
  const list = makeElement("ul", "library-status-count-list");
  STATE_ORDER.forEach((state) => list.append(makeElement("li", "", `${STATE_LABELS[state]}: ${counts[state] || 0}`)));
  target.append(list);
}

function appendNamedList(target, heading, values, labelForShowId) {
  const section = makeElement("section", "library-preview-list");
  section.append(makeElement("h5", "", `${heading} (${values.length})`));
  if (!values.length) {
    section.append(makeElement("p", "", "None"));
  } else {
    const list = makeElement("ul");
    values.forEach((value) => list.append(makeElement("li", "", labelForShowId(value))));
    section.append(list);
  }
  target.append(section);
}

export function renderImportPreview(preview, { labelForShowId, entriesAvailable }) {
  const content = document.createDocumentFragment();
  if (!preview) return { content, buttonText: "Import Library", disabled: true };

  const resultingCount = preview.resultingEntryCount ?? (preview.operationMode === "replace" ? preview.totalEntries : 0);
  const resultLabel = preview.operationMode === "replace" ? "entries after Replace" : "entries after Merge";
  content.append(makeElement("p", "", `${preview.totalEntries} entries in this file. ${resultingCount} ${resultLabel}.`));
  appendCountList(content, preview.statusCounts || {});
  appendNamedList(content, "Unresolved IDs", preview.unknownCatalogueIds || [], labelForShowId);
  appendNamedList(content, "Same-ID conflicts", preview.sameIdConflicts || [], labelForShowId);
  if (preview.catalogueContextAvailable === false && preview.unknownCatalogueIds === null) {
    content.append(makeElement("p", "library-preview-note", "Current catalogue data was unavailable, so unknown IDs could not be checked."));
  }

  const invalidData = Array.isArray(preview.invalidData) ? preview.invalidData : [];
  if (invalidData.length) {
    const issueSection = makeElement("section", "library-preview-list");
    issueSection.append(makeElement("h5", "", `Invalid data (${invalidData.length})`));
    const issueList = makeElement("ul");
    invalidData.slice(0, 20).forEach((issue) => issueList.append(makeElement("li", "", `${issue.path}: ${issue.code}`)));
    if (invalidData.length > 20) issueList.append(makeElement("li", "", `${invalidData.length - 20} more issues`));
    issueSection.append(issueList);
    content.append(issueSection);
  } else {
    content.append(makeElement("p", "library-preview-validity", "All entries passed validation."));
  }

  return {
    content,
    buttonText: preview.operationMode === "replace" ? "Review Replace" : "Merge into Library",
    disabled: preview.valid !== true || !preview.previewId || !entriesAvailable,
  };
}
