import { renderBadge } from "../maintainer/format.js";
import { escapeHtml } from "./format.js";

export function renderQuickDetailsEditor(candidate) {
  const objective = candidate.objective || {};
  const enrichment = objective.manualEnrichment || {};
  const value = (field, fallback = "") => escapeHtml(String(objective[field] ?? fallback ?? ""));
  const enrichmentValue = (field) => escapeHtml(Array.isArray(enrichment[field]) ? enrichment[field].join(", ") : String(enrichment[field] ?? ""));
  const creditValue = escapeHtml((enrichment.people || []).map((person) => `${person.name} — ${person.role}`).join("\n"));
  const completionStatus = objective.manualReleaseState || (objective.complete ? "finished" : "unknown");
  return `
    <section class="maintainer-detail-section import-details-editor">
      <div class="import-source-card-top"><div><h3>Edit show details</h3><p>Correct factual information here, then save. This updates the publication preview without fetching sources again.</p></div>${renderBadge("Maintainer edits are locked", "neutral")}</div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>Title</span><input name="title" required value="${value("title", candidate.title)}" /></label><label class="maintainer-field"><span>Creator</span><input name="creatorName" value="${value("creatorName", candidate.creatorName)}" /></label><label class="maintainer-field"><span>Network</span><input name="networkName" value="${value("networkName")}" /></label><label class="maintainer-field"><span>Language</span><input name="language" value="${value("language")}" placeholder="English" /></label>
      </div>
      <label class="maintainer-field"><span>Subtitle</span><input name="subtitle" value="${escapeHtml(objective.manualSubtitle || objective.subtitle || "")}" placeholder="Official subtitle or short descriptor" /></label>
      <label class="maintainer-field"><span>Description</span><textarea name="description" rows="6" placeholder="Official or source-verified description">${value("description")}</textarea></label>
      <div class="maintainer-review-grid"><label class="maintainer-field"><span>Genres</span><input name="categories" value="${escapeHtml((objective.categories || []).join(", "))}" placeholder="sci-fi, horror" /></label><label class="maintainer-field"><span>Discovery tags</span><input name="tags" value="${escapeHtml((objective.manualTags || candidate.preparedRecord?.tags || []).join(", "))}" placeholder="Sci-fi, Space, Survival" /></label><label class="maintainer-field"><span>Completion</span><select name="completionStatus">${[["unknown", "Unknown"], ["ongoing", "Ongoing"], ["finished", "Finished"]].map(([key, label]) => `<option value="${key}" ${completionStatus === key ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>RSS feed</span><input name="rssUrl" type="url" value="${value("rssUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Official website</span><input name="websiteUrl" type="url" value="${value("websiteUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Apple Podcasts</span><input name="appleUrl" type="url" value="${value("appleUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Spotify</span><input name="spotifyUrl" type="url" value="${value("spotifyUrl")}" placeholder="https://…" /></label><label class="maintainer-field"><span>Verified start-listening URL</span><input name="startUrl" type="url" value="${value("startUrl")}" placeholder="Official episode one, season one, or start-here page" /></label>
      </div>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>Episodes</span><input name="episodeCount" type="number" min="0" step="1" value="${value("episodeCount")}" /></label><label class="maintainer-field"><span>Seasons</span><input name="seasonCount" type="number" min="0" step="1" value="${value("seasonCount")}" /></label><label class="maintainer-field"><span>Average runtime (minutes)</span><input name="avgEpisodeMinutes" type="number" min="0" step="0.1" value="${value("avgEpisodeMinutes")}" /></label><label class="maintainer-field"><span>First release</span><input name="firstPublicationDate" type="date" value="${value("firstPublicationDate")}" /></label><label class="maintainer-field"><span>Latest release</span><input name="latestPublicationDate" type="date" value="${value("latestPublicationDate")}" /></label>
      </div>
      <section class="maintainer-detail-section">
        <div class="import-source-card-top"><div><h4>Source-backed catalog enrichment</h4><p>Use official copy or credited pages only. These fields improve discovery but never create ratings, reviews, or archive judgment.</p></div></div>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Formats</span><input name="formats" value="${enrichmentValue("formats")}" placeholder="Serialized, Full cast" /></label>
          <label class="maintainer-field"><span>Tones</span><input name="tones" value="${enrichmentValue("tones")}" placeholder="Atmospheric, Suspenseful" /></label>
          <label class="maintainer-field"><span>Themes</span><input name="themes" value="${enrichmentValue("themes")}" placeholder="Isolation, First contact" /></label>
          <label class="maintainer-field"><span>Content notes</span><input name="contentNotes" value="${enrichmentValue("contentNotes")}" placeholder="Only explicit source-backed advisories" /></label>
        </div>
        <label class="maintainer-field"><span>Credits</span><textarea name="credits" rows="4" placeholder="One per line: Name — role">${creditValue}</textarea></label>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Patreon</span><input name="patreonUrl" type="url" value="${escapeHtml(enrichment.officialLinks?.patreonUrl || objective.patreonUrl || "")}" placeholder="https://…" /></label>
          <label class="maintainer-field"><span>Ko-fi</span><input name="koFiUrl" type="url" value="${escapeHtml(enrichment.officialLinks?.koFiUrl || objective.koFiUrl || "")}" placeholder="https://…" /></label>
          <label class="maintainer-field"><span>Discord</span><input name="discordUrl" type="url" value="${escapeHtml(enrichment.officialLinks?.discordUrl || objective.discordUrl || "")}" placeholder="https://…" /></label>
          <label class="maintainer-field"><span>YouTube</span><input name="youtubeUrl" type="url" value="${escapeHtml(enrichment.officialLinks?.youtubeUrl || objective.youtubeUrl || "")}" placeholder="https://…" /></label>
        </div>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Official social links</span><input name="socialUrls" value="${enrichmentValue("socialUrls")}" placeholder="https://…, https://…" /></label>
          <label class="maintainer-field"><span>Release cadence</span><input name="cadenceLabel" value="${enrichmentValue("cadenceLabel")}" placeholder="Weekly, biweekly, or an official schedule" /></label>
        </div>
        <input type="hidden" name="externalVerification" value="" />
      </section>
      <div class="maintainer-review-actions"><button class="maintainer-primary-button" type="submit" data-import-save-details="true">Save show details</button><p class="maintainer-panel-meta">Your edits remain locked when the candidate is prepared again.</p></div>
    </section>
  `;
}
