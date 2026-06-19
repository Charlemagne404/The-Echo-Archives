export function getSubmitElements() {
  const elements = {
    form: document.getElementById("showSubmitForm"),
    submissionType: document.getElementById("submissionType"),
    existingShowId: document.getElementById("existingShowId"),
    heroDescription: document.getElementById("submitHeroDescription"),
    modeCards: document.getElementById("submitModeCards"),
    stepsPanel: document.getElementById("submitStepsPanel"),
    formIntro: document.getElementById("submitFormIntro"),
    dynamicFields: document.getElementById("submitDynamicFields"),
    sideRail: document.getElementById("submitSideRail"),
    submitButton: document.getElementById("submitPrimaryButton"),
    submitButtonText: document.getElementById("submitPrimaryButtonText"),
    submitFooterNote: document.getElementById("submitFooterNote"),
    submitStatus: document.getElementById("submitStatus"),
  };

  if (
    !(elements.form instanceof HTMLFormElement) ||
    !(elements.submissionType instanceof HTMLInputElement) ||
    !(elements.existingShowId instanceof HTMLInputElement) ||
    !(elements.heroDescription instanceof HTMLElement) ||
    !elements.modeCards ||
    !elements.stepsPanel ||
    !elements.formIntro ||
    !elements.dynamicFields ||
    !elements.sideRail ||
    !(elements.submitButton instanceof HTMLButtonElement) ||
    !elements.submitButtonText ||
    !elements.submitFooterNote ||
    !elements.submitStatus
  ) {
    return null;
  }

  return elements;
}
