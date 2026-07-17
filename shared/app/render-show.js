import { renderCorrectionSection, renderFactsLinksCard } from "./render-show/facts.js";
import { renderDetailHero } from "./render-show/hero.js";
import { renderCollectionsSection, renderSimilarSection } from "./render-show/relationships.js";
import {
  renderCommunityFallback,
  renderCommunityScoreBreakdown,
  renderOverviewSection,
  renderReviewSection,
} from "./render-show/sections.js";

export function createShowPageMarkup(show, showMap, collections = [], reviewData = {}) {
  const isFullReview = show.reviewStatus === "full-review";
  const facts = renderFactsLinksCard(show, { inline: !isFullReview });

  return `
    <section class="detail-main podcast-detail detail-main--${isFullReview ? "full" : "indexed"}">
      ${renderDetailHero(show)}

      <div class="detail-content-layout">
        <div class="detail-main-stack">
          <div class="detail-main-column">
            ${renderOverviewSection(show)}
              ${renderReviewSection(show, reviewData)}
              ${renderCommunityScoreBreakdown(show, reviewData?.scoreSummary)}
              ${isFullReview ? "" : facts}
          </div>
        </div>
        ${renderCommunityFallback()}

        ${isFullReview ? `<aside class="detail-side-rail">${facts}</aside>` : ""}

        ${renderSimilarSection(show, showMap)}
        ${renderCollectionsSection(show, collections, showMap)}
        ${renderCorrectionSection(show)}
      </div>
    </section>
  `;
}
