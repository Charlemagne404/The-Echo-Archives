import { renderModeCardsMarkup } from "./render/mode-cards.js";
import { renderRailCard } from "./render/rail.js";
import { renderCorrectionMode } from "./render/modes/correction.js";
import { renderCreatorVerificationMode } from "./render/modes/creator-verification.js";
import { renderListenerReviewMode } from "./render/modes/listener-review.js";
import { renderShowMode } from "./render/modes/show.js";

export { renderModeCardsMarkup, renderRailCard };

export function renderModeFields(mode, draft, context) {
  switch (mode) {
    case "show":
      return renderShowMode(draft, context);
    case "correction":
      return renderCorrectionMode(draft, context);
    case "listener-review":
      return renderListenerReviewMode(draft, context);
    case "creator-verification":
      return renderCreatorVerificationMode(draft, context);
    default:
      return "";
  }
}
