import { toDisplayTag } from "../utils.js";

function formatInlineTagList(tags, maxItems) {
  return tags
    .slice(0, maxItems)
    .map((tag) => toDisplayTag(tag))
    .join(" • ");
}

export { formatInlineTagList };
