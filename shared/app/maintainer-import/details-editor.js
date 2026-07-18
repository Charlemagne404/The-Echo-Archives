import { renderBadge } from "../maintainer/format.js";
import { escapeHtml } from "./format.js";

export function renderQuickDetailsEditor(candidate) {
  const objective = candidate.objective || {};
  const value = (field, fallback = "") => escapeHtml(String(objective[field] ?? fallback ?? ""));
  const completionStatus = objective.manualReleaseState || (objective.complete ? "finished" : "unknown");
  return `
    <section class="maintainer-detail-section import-details-editor">
      <div class="import-source-card-top"><div><h3>Edit show details</h3><p>Correct factual information here, then save. This updates the publication preview without fetching sources again.</p></div>${renderBadge("Maintainer edits are locked", "neutral")}</div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>Title</span><input name="title" required value="${value("title", candidate.title)}" /></label><label class="maintainer-field"><span>Creator</span><input name="creatorName" value="${value("creatorName", candidate.creatorName)}" /></label><label class="maintainer-field"><span>Network</span><input name="networkName" value="${value("networkName")}" /></label><label class="maintainer-field"><span>Language</span><input name="language" value="${value("language")}" placeholder="English" /></label>
      </div>
      <label class="maintainer-field"><span>Description</span><textarea name="description" rows="6" placeholder="Official or source-verified description">${value("description")}</textarea></label>
      <div class="maintainer-review-grid"><label class="maintainer-field"><span>Genres</span><input name="categories" value="${escapeHtml((objective.categories || []).join(", "))}" placeholder="sci-fi, horror" /></label><label class="maintainer-field"><span>Discovery tags</span><input name="tags" value="${escapeHtml((objective.manualTags || candidate.preparedRecord?.tags || []).join(", "))}" placeholder="Sci-fi, Space, Survival" /></label><label class="maintainer-field"><span>Completion</span><select name="completionStatus">${[["unknown", "Unknown"], ["ongoing", "Ongoing"], ["finished", "Finished"]].map(([key, label]) => `<option value="${key}" ${completionStatus === key ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>RSS feed</span><input name="rssUrl" type="url" value="${value("rssUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Official website</span><input name="websiteUrl" type="url" value="${value("websiteUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Apple Podcasts</span><input name="appleUrl" type="url" value="${value("appleUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Spotify</span><input name="spotifyUrl" type="url" value="${value("spotifyUrl")}" placeholder="https://…" /></label>
      </div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>Episodes</span><input name="episodeCount" type="number" min="0" step="1" value="${value("episodeCount")}" /></label><label class="maintainer-field"><span>Seasons</span><input name="seasonCount" type="number" min="0" step="1" value="${value("seasonCount")}" /></label><label class="maintainer-field"><span>Average runtime (minutes)</span><input name="avgEpisodeMinutes" type="number" min="0" step="0.1" value="${value("avgEpisodeMinutes")}" /></label><label class="maintainer-field"><span>First release</span><input name="firstPublicationDate" type="date" value="${value("firstPublicationDate")}" /></label><label class="maintainer-field"><span>Latest release</span><input name="latestPublicationDate" type="date" value="${value("latestPublicationDate")}" /></label>
      </div>
      <div class="maintainer-review-actions"><button class="maintainer-primary-button" type="submit" data-import-save-details="true">Save show details</button><p class="maintainer-panel-meta">Your edits remain locked when the candidate is prepared again.</p></div>
    </section>
  `;
}
