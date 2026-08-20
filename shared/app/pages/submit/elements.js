export function getSubmitElements() {
  const elements = {
    form: document.getElementById("showSubmitForm"),
    submissionType: document.getElementById("submissionType"),
    existingShowId: document.getElementById("existingShowId"),
    heroDescription: document.getElementById("submitHeroDescription"),
    loadStatus: document.getElementById("submitLoadStatus"),
    modeCards: document.getElementById("submitModeCards"),
    formIntro: document.getElementById("submitFormIntro"),
    dynamicFields: document.getElementById("submitDynamicFields"),
    sideRail: document.getElementById("submitSideRail"),
    submitButton: document.getElementById("submitPrimaryButton"),
    submitButtonText: document.getElementById("submitPrimaryButtonText"),
    submitFooterNote: document.getElementById("submitFooterNote"),
    legalAcknowledgement: document.getElementById("submitLegalAcknowledgement"),
    submitStatus: document.getElementById("submitStatus"),
    resultPanel: document.getElementById("submitResultPanel"),
  };

  if (
    !(elements.form instanceof HTMLFormElement) ||
    !(elements.submissionType instanceof HTMLInputElement) ||
    !(elements.existingShowId instanceof HTMLInputElement) ||
    !(elements.heroDescription instanceof HTMLElement) ||
    !(elements.loadStatus instanceof HTMLElement) ||
    !elements.modeCards ||
    !elements.formIntro ||
    !elements.dynamicFields ||
    !elements.sideRail ||
    !(elements.submitButton instanceof HTMLButtonElement) ||
    !elements.submitButtonText ||
    !elements.submitFooterNote ||
    !(elements.legalAcknowledgement instanceof HTMLInputElement) ||
    elements.legalAcknowledgement.type !== "checkbox" ||
    !elements.submitStatus ||
    !(elements.resultPanel instanceof HTMLElement)
  ) {
    return null;
  }

  return elements;
}
