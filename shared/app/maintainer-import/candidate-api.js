import {
  confirmMaintainerImportFactualReview,
  draftMaintainerImportCandidate,
  hydrateMaintainerImportCandidate,
  patchMaintainerImportCandidateReview,
  promoteMaintainerElevationDraft,
  promoteMaintainerImportCandidate,
  publishMaintainerImportCandidate,
  reopenMaintainerImportCandidate,
  retryMaintainerImportCandidate,
  selectMaintainerImportEvidence,
  verifyMaintainerImportExternalIdentity,
} from "../maintainer/api.js";

export const candidateApi = {
  hydrate: hydrateMaintainerImportCandidate,
  draft: draftMaintainerImportCandidate,
  retry: retryMaintainerImportCandidate,
  reopen: reopenMaintainerImportCandidate,
  publish: publishMaintainerImportCandidate,
  factualReview: confirmMaintainerImportFactualReview,
  promoteElevation: promoteMaintainerElevationDraft,
  promote: promoteMaintainerImportCandidate,
  review: patchMaintainerImportCandidateReview,
  selectEvidence: selectMaintainerImportEvidence,
  verifyExternalIdentity: verifyMaintainerImportExternalIdentity,
};
