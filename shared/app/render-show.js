import { createCollectionShowCard } from "./render-cards.js";
import { renderCorrectionSection, renderFactsLinksCard } from "./render-show/facts.js";
import { renderDetailHero } from "./render-show/hero.js";
import {
  getShowRelationshipState,
  renderCollectionsSection,
  renderShowContinuationSection,
  renderSimilarSection,
} from "./render-show/relationships.js";
import {
  renderCommunityFallback,
  renderCommunityScoreBreakdown,
  renderFirstReviewCta,
  renderImportedTransparency,
  renderIndexedArchiveNote,
  renderOverviewSection,
  renderReviewSection,
} from "./render-show/sections.js";

export function createShowPageMarkup(show, showMap, collections = [], reviewData = {}) {
  const isFullReview = show.reviewStatus === "full-review";
  const facts = renderFactsLinksCard(show, { inline: !isFullReview });
  const relationshipState = getShowRelationshipState(show, showMap, collections);

  return `
    <section class="detail-main podcast-detail detail-main--${isFullReview ? "full" : "indexed"}">
      ${renderDetailHero(show, reviewData)}

      <div class="detail-content-layout">
        <div class="detail-main-stack">
          <div class="detail-main-column">
            ${renderImportedTransparency(show)}
            ${renderOverviewSection(show)}
              ${renderIndexedArchiveNote(show)}
              ${renderReviewSection(show, reviewData)}
              ${renderFirstReviewCta(show, reviewData)}
              ${renderCommunityScoreBreakdown(show, reviewData?.scoreSummary)}
              ${isFullReview ? "" : facts}
          </div>
        </div>
        ${renderCommunityFallback()}

        ${isFullReview && facts ? `<aside class="detail-side-rail">${facts}</aside>` : ""}

        ${globalThis.EchoArchiveEntities.renderMoreFrom(show, [...showMap.values()], (entry, entity) => createCollectionShowCard(entry, "", {
          surface: "show_more_from",
          resultType: "more_from",
          recommendationSource: "creator_more_from",
          entityId: entity?.id || "",
        }).outerHTML)}
        ${renderSimilarSection(show, showMap, collections, null, relationshipState)}
        ${renderCollectionsSection(show, collections, showMap, relationshipState)}
        ${renderShowContinuationSection(show, relationshipState)}
        ${renderCorrectionSection(show)}
      </div>
    </section>
  `;
}
