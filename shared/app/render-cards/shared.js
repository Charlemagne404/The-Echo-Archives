import { toDisplayTag } from "../utils.js";

function formatInlineTagList(tags, maxItems) {
  return (Array.isArray(tags) ? tags : [])
    .slice(0, maxItems)
    .map((tag) => toDisplayTag(tag))
    .join(" • ");
}

export { formatInlineTagList };
