import { correctionModeConfig } from "./modes/correction.js";
import { creatorVerificationModeConfig } from "./modes/creator-verification.js";
import { listenerReviewModeConfig } from "./modes/listener-review.js";
import { showModeConfig } from "./modes/show.js";

export const MODE_CONFIG = {
  show: showModeConfig,
  correction: correctionModeConfig,
  "listener-review": listenerReviewModeConfig,
  "creator-verification": creatorVerificationModeConfig,
};
