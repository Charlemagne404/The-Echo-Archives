import { getLibraryRuntimeState, subscribeToLibraryRuntime } from "../../library/runtime.js";

const DISABLED_PERSONAL_CONTEXT = Object.freeze({ enabled: false, entries: Object.freeze([]) });

function getUsablePersonalContext(runtimeState) {
  const context = runtimeState?.personalContext;
  if (
    runtimeState?.loading
    || !runtimeState?.storageAvailable
    || runtimeState?.personalDiscoveryError
    || context?.enabled !== true
    || !Array.isArray(context.entries)
    || !context.entries.length
  ) return DISABLED_PERSONAL_CONTEXT;
  return context;
}

export function createHomePersonalContext(runtimeEvidencePromise) {
  let personalContext = getUsablePersonalContext(getLibraryRuntimeState());

  const applyPersonalContext = (runtimeState, onChange) => {
    const nextContext = getUsablePersonalContext(runtimeState);
    if (nextContext === personalContext) return false;
    personalContext = nextContext;
    onChange();
    return true;
  };

  return {
    getCurrentContext: () => personalContext,
    subscribe(onChange) {
      subscribeToLibraryRuntime((runtimeState) => applyPersonalContext(runtimeState, onChange));
      void runtimeEvidencePromise.then(() => {
        if (personalContext.enabled) onChange();
      });
    },
  };
}
