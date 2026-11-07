import { getActiveDraft } from "../../submit/state.js";
import { captureCurrentDraft } from "./draft.js";

function setCategoryRatingSliderState(slider, value, progressValue = value, escapeCssIdentifier) {
  const key = slider.getAttribute("data-category-score-slider");
  if (!key) {
    return;
  }

  const progress = ((progressValue - 1) / 9) * 100;
  slider.parentElement?.style.setProperty("--category-rating-progress", `${progress}%`);
  slider.setAttribute("aria-valuetext", `${value} out of 10`);

  const group = slider.closest("[data-category-score-group]");
  const output = group?.querySelector(`[data-category-rating-value="${escapeCssIdentifier(key)}"]`);
  if (output && output.textContent !== `${value}/10`) {
    output.textContent = `${value}/10`;
  }

  const clearButton = group?.querySelector(`[data-clear-category-score="${escapeCssIdentifier(key)}"]`);
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.hidden = false;
  }

  const ratedCount = document.querySelectorAll("[data-category-score-slider][data-category-score-selected='true']").length;
  const wasSelected = slider.dataset.categoryScoreSelected === "true";
  slider.dataset.categoryScoreSelected = "true";
  if (!wasSelected) {
    const count = document.querySelector("[data-category-ratings-count]");
    if (count) {
      count.textContent = `${ratedCount + 1} of ${document.querySelectorAll("[data-category-score-slider]").length} rated`;
    }
  }
}

export function bindCategoryRatingInteractions({ state, elements, escapeCssIdentifier }) {
  let activeCategorySlider = null;

  function updateCategoryRating(slider, { snap = false } = {}) {
    const key = slider.getAttribute("data-category-score-slider");
    const rawValue = Number(slider.value);
    if (!key || !Number.isFinite(rawValue) || rawValue < 1 || rawValue > 10) {
      return;
    }

    const value = Math.max(1, Math.min(10, Math.round(rawValue)));
    if (snap) {
      slider.value = String(value);
    }

    const draft = getActiveDraft(state);
    const isNewRating = slider.dataset.categoryScoreSelected !== "true";
    const storedValue = Number(draft.categoryScores?.[key]);
    if (isNewRating || storedValue !== value) {
      captureCurrentDraft(state, elements);
      const currentDraft = getActiveDraft(state);
      currentDraft.categoryScores = { ...(currentDraft.categoryScores || {}), [key]: value };
      state.persistActiveDraft?.();
      state.onDraftChanged?.();
    }

    setCategoryRatingSliderState(slider, value, snap ? value : rawValue, escapeCssIdentifier);
  }

  function animateCategoryRatingCommit(slider) {
    const output = slider.closest("[data-category-score-group]")?.querySelector("[data-category-rating-value]");
    const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!(output instanceof HTMLElement) || prefersReducedMotion || typeof output.animate !== "function") {
      return;
    }

    output.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.08)" },
        { transform: "scale(1)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }

  elements.form.addEventListener("input", (event) => {
    const slider = event.target;
    if (!(slider instanceof HTMLInputElement) || !slider.matches("[data-category-score-slider]")) {
      return;
    }
    updateCategoryRating(slider);
  });

  elements.form.addEventListener("change", (event) => {
    const slider = event.target;
    if (slider instanceof HTMLInputElement && slider.matches("[data-category-score-slider]")) {
      updateCategoryRating(slider, { snap: true });
      slider.classList.remove("is-dragging");
      animateCategoryRatingCommit(slider);
    }
  });

  elements.form.addEventListener("pointerdown", (event) => {
    const slider = event.target instanceof Element ? event.target.closest("[data-category-score-slider]") : null;
    if (slider instanceof HTMLInputElement) {
      activeCategorySlider = slider;
      slider.classList.add("is-dragging");
    }
  });

  function finishCategorySliderDrag() {
    if (!(activeCategorySlider instanceof HTMLInputElement)) {
      return;
    }

    const wasUnrated = activeCategorySlider.dataset.categoryScoreSelected !== "true";
    updateCategoryRating(activeCategorySlider, { snap: true });
    activeCategorySlider.classList.remove("is-dragging");
    if (wasUnrated) {
      animateCategoryRatingCommit(activeCategorySlider);
    }
    activeCategorySlider = null;
  }

  window.addEventListener("pointerup", finishCategorySliderDrag, { passive: true });
  window.addEventListener("pointercancel", finishCategorySliderDrag, { passive: true });

  elements.form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-category-score-slider]")) {
      return;
    }

    const currentValue = Math.round(Number(target.value));
    let nextValue = currentValue;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextValue += 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextValue -= 1;
        break;
      case "PageUp":
        nextValue += 2;
        break;
      case "PageDown":
        nextValue -= 2;
        break;
      case "Home":
        nextValue = 1;
        break;
      case "End":
        nextValue = 10;
        break;
      default:
        return;
    }

    event.preventDefault();
    target.value = String(Math.max(1, Math.min(10, nextValue)));
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
