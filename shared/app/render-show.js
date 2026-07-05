import { renderArchiveTakeCard, renderCorrectionSection, renderFactsLinksCard } from "./render-show/facts.js";
import { renderDetailHero } from "./render-show/hero.js";
import { renderCollectionsSection, renderSimilarSection } from "./render-show/relationships.js";
import {
  renderCreatorLinksSection,
  renderOfficialSummarySection,
  renderOverviewSection,
  renderQuoteSection,
  renderReviewSection,
} from "./render-show/sections.js";

export function createShowPageMarkup(show, showMap, collections = []) {
  return `
    <section class="detail-main podcast-detail">
      ${renderDetailHero(show)}

      <div class="detail-content-layout">
        <div class="detail-main-stack">
          ${renderOfficialSummarySection(show)}
          ${renderCreatorLinksSection(show)}
          <div class="detail-main-column">
            ${renderOverviewSection(show)}
            ${renderReviewSection(show)}
            ${renderQuoteSection(show)}
          </div>
        </div>
        <div class="detail-community-slot"></div>

        <aside class="detail-side-rail">
          ${renderArchiveTakeCard(show)}
          ${renderFactsLinksCard(show)}
        </aside>

        ${renderSimilarSection(show, showMap)}
        ${renderCollectionsSection(show, collections)}
        ${renderCorrectionSection(show)}
      </div>
    </section>
  `;
}
