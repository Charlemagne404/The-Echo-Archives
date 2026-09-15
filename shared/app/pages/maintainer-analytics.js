import {
  createMaintainerSession,
  destroyMaintainerSession,
  fetchMaintainerAnalytics,
  MaintainerAuthError,
} from "../maintainer/api.js";
import {
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  initializeAuthFlow,
  isAbortError,
  runMaintainerAction,
  setMaintainerViewState,
} from "../maintainer/page-helpers.js";

const RANGE_KEYS = new Set(["24h", "7d", "30d", "all"]);
const EVENT_LABELS = {
  "Search Used": "Searches",
  "Filter Changed": "Filter changes",
  "Filters Cleared": "Filters cleared",
  "Collection Opened": "Collections opened",
  "Entity Opened": "Creator pages opened",
  "Show Opened": "Shows opened",
  "Listen Link Opened": "Listen links",
  "Rating Submitted": "Ratings saved",
  "Rating Removed": "Ratings removed",
  "Helpful Vote": "Helpful votes",
  "Helpful Vote Removed": "Helpful votes removed",
  "Catalogue Submission": "Catalogue submissions",
};

const DISCOVERY_SURFACE_LABELS = {
  home_archive: "Home archive",
  home_archive_grid: "Home archive grid",
  home_collection_rail: "Home collection rail",
  home_entity_results: "Home creator results",
  home_popular_rail: "Home popular rail",
  home_recent_rail: "Home recent rail",
  collections_directory: "Collections directory",
  collections_featured: "Featured collections",
  collection_page_grid: "Collection show grid",
  collection_page_related: "Related collection route",
  collection_membership: "Collection membership",
  entity_directory: "Creator directory",
  entity_directory_card: "Creator directory card",
  entity_directory_featured: "Featured creator",
  entity_page_grid: "Creator show grid",
  entity_page_related: "Related creator route",
  show_page_credit: "Show-page credit",
  show_page_membership: "Show-page collection link",
  show_similar: "Similar shows",
  show_more_from: "More from",
  internal_link: "Internal link",
  internal_navigation: "Internal navigation",
  unknown_internal: "Unknown internal route",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatAverage(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown date";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatBucket(value, rangeKey) {
  const options = rangeKey === "24h"
    ? { weekday: "short", hour: "numeric" }
    : rangeKey === "all"
      ? { month: "short", year: "numeric" }
      : { month: "short", day: "numeric" };
  return formatDate(value, options);
}

function formatDimension(value) {
  const normalized = String(value || "unknown").trim();
  return DISCOVERY_SURFACE_LABELS[normalized]
    || normalized.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatChange(change) {
  if (!change?.available) return { text: "No previous-period comparison", tone: "neutral" };
  if (change.percentage === null) {
    if (change.delta > 0) return { text: "New this period", tone: "positive" };
    if (change.delta < 0) return { text: `${formatNumber(change.delta)} vs previous`, tone: "negative" };
    return { text: "No change", tone: "neutral" };
  }
  const prefix = change.percentage > 0 ? "+" : "";
  return {
    text: `${prefix}${change.percentage}% vs previous`,
    tone: change.percentage > 0 ? "positive" : change.percentage < 0 ? "negative" : "neutral",
  };
}

function renderSummaryCards(metrics = {}) {
  const order = [
    "uniqueVisitors",
    "sessions",
    "pageViews",
    "engagedSessions",
    "showOpens",
    "listenClicks",
    "ratingsSubmitted",
    "catalogueSubmissions",
  ];
  return order.map((key) => {
    const metric = metrics[key] || { label: key, value: 0, change: { available: false }, note: "" };
    const change = formatChange(metric.change);
    return `
      <article class="maintainer-summary-card analytics-summary-card">
        <p class="maintainer-summary-label">${escapeHtml(metric.label)}</p>
        <p class="maintainer-summary-value">${formatNumber(metric.value)}</p>
        <p class="analytics-summary-change analytics-summary-change--${change.tone}">${escapeHtml(change.text)}</p>
        <p class="analytics-summary-note">${escapeHtml(metric.note)}</p>
      </article>
    `;
  }).join("");
}

function renderEmpty(message = "No tracked events in this range.") {
  return `<p class="analytics-empty-state">${escapeHtml(message)}</p>`;
}

function renderChart(container, points, series, rangeKey) {
  if (!(container instanceof HTMLElement)) return;
  if (!Array.isArray(points) || points.length === 0) {
    container.innerHTML = renderEmpty();
    return;
  }
  const maximum = Math.max(1, ...points.flatMap((point) => series.map(({ key }) => Number(point?.[key] || 0))));
  const primarySeries = series[0];
  const primaryTotal = points.reduce((total, point) => total + Number(point?.[primarySeries.key] || 0), 0);
  const peakPoint = points.reduce((peak, point) => Number(point?.[primarySeries.key] || 0) > Number(peak?.[primarySeries.key] || 0) ? point : peak, points[0]);
  const primaryLabel = primarySeries.label.toLowerCase();
  container.innerHTML = `
    <div class="analytics-chart-meta">
      <div class="analytics-chart-legend">
        ${series.map((item) => `<span class="analytics-legend-item analytics-legend-item--${escapeHtml(item.tone)}"><i aria-hidden="true"></i>${escapeHtml(item.label)}</span>`).join("")}
      </div>
      <p class="analytics-chart-summary">${formatNumber(primaryTotal)} ${escapeHtml(primaryLabel)} · peak ${formatNumber(peakPoint?.[primarySeries.key])}</p>
    </div>
    <div class="analytics-chart-rows">
      ${points.map((point) => {
        const label = formatBucket(point.bucket, rangeKey);
        const values = series.map(({ key, label: seriesLabel }) => `${seriesLabel} ${formatNumber(point[key])}`).join(", ");
        return `
          <div class="analytics-chart-row" aria-label="${escapeHtml(`${label}: ${values}`)}">
            <span class="analytics-chart-label">${escapeHtml(label)}</span>
            <div class="analytics-chart-lines">
              ${series.map((item) => {
                const value = Number(point?.[item.key] || 0);
                const width = Math.round((value / maximum) * 100);
                return `
                  <div class="analytics-chart-line">
                    <span class="analytics-bar-track"><span class="analytics-bar analytics-bar--${escapeHtml(item.tone)}" style="--bar-width: ${width}%"></span></span>
                    <span class="analytics-chart-value">${formatNumber(value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderRankedList(container, items, { emptyMessage, renderItem }) {
  if (!(container instanceof HTMLElement)) return;
  container.innerHTML = Array.isArray(items) && items.length > 0
    ? `<ol class="analytics-ranked-list">${items.map((item, index) => renderItem(item, index)).join("")}</ol>`
    : renderEmpty(emptyMessage);
}

function renderTopShows(item, index) {
  return `
    <li class="analytics-ranked-item">
      <span class="analytics-rank">${index + 1}</span>
      <div class="analytics-ranked-copy">
        <a href="/shows/${encodeURIComponent(item.showId)}">${escapeHtml(item.title)}</a>
        <span>${formatNumber(item.pageViews)} views · ${formatNumber(item.listenClicks)} listens · ${formatNumber(item.ratings)} ratings</span>
      </div>
    </li>
  `;
}

function renderTopPage(item, index) {
  return `
    <li class="analytics-ranked-item">
      <span class="analytics-rank">${index + 1}</span>
      <div class="analytics-ranked-copy">
        <strong>${escapeHtml(item.path)}</strong>
        <span>${formatNumber(item.pageViews)} views · ${formatNumber(item.sessions)} sessions · ${formatNumber(item.visitors)} visitors</span>
      </div>
    </li>
  `;
}

function renderTopCollection(item, index) {
  return `
    <li class="analytics-ranked-item">
      <span class="analytics-rank">${index + 1}</span>
      <div class="analytics-ranked-copy">
        <a href="/collections/${encodeURIComponent(item.collectionId)}">${escapeHtml(item.title)}</a>
        <span>${formatNumber(item.opens)} opens · ${formatNumber(item.showOpens)} show opens · ${formatNumber(item.sessions)} sessions</span>
      </div>
    </li>
  `;
}

function renderMostRated(item, index) {
  return `
    <li class="analytics-ranked-item">
      <span class="analytics-rank">${index + 1}</span>
      <div class="analytics-ranked-copy">
        <a href="/shows/${encodeURIComponent(item.showId)}">${escapeHtml(item.title)}</a>
        <span>${formatNumber(item.ratingCount)} active ratings · average ${escapeHtml(formatAverage(item.averageRating))}/10</span>
      </div>
    </li>
  `;
}

function renderSource(item, index) {
  return `
    <li class="analytics-ranked-item">
      <span class="analytics-rank">${index + 1}</span>
      <div class="analytics-ranked-copy">
        <strong>${escapeHtml(item.source)}</strong>
        <span>${formatNumber(item.pageViews)} views · ${formatNumber(item.sessions)} sessions · ${formatNumber(item.visitors)} visitors</span>
      </div>
    </li>
  `;
}

function renderFunnel(container, funnel) {
  if (!(container instanceof HTMLElement)) return;
  const rows = [
    ["Tracked sessions", funnel.sessions, null],
    ["Engaged sessions", funnel.engagedSessions, funnel.engagedRate],
    ["Sessions opening a collection", funnel.collectionSessions, funnel.collectionRate],
    ["Sessions opening a show", funnel.showOpenSessions, funnel.showOpenRate],
    ["Sessions clicking a listen link", funnel.listenSessions, funnel.listenRate],
    ["Sessions saving a rating", funnel.ratingSessions, funnel.ratingRate],
    ["Sessions submitting to the catalogue", funnel.submissionSessions, funnel.submissionRate],
  ];
  const maximum = Math.max(1, ...rows.map(([, value]) => Number(value || 0)));
  container.innerHTML = rows.map(([label, value, rate]) => `
    <div class="analytics-funnel-row">
      <div class="analytics-funnel-label"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>
      <div class="analytics-funnel-track"><span style="--bar-width: ${Math.round((Number(value || 0) / maximum) * 100)}%"></span></div>
      <p>${rate === null ? "Entry point" : `${rate}% of tracked sessions`}</p>
    </div>
  `).join("");
}

function renderRecordTotals(container, totals) {
  if (!(container instanceof HTMLElement)) return;
  const rows = [
    ["Active ratings", totals.activeRatings],
    ["Retained catalogue submissions", totals.catalogueSubmissions],
    ["Published listener reviews", totals.publishedListenerReviews],
    ["Helpful votes", totals.helpfulVotes],
  ];
  container.innerHTML = rows.map(([label, value]) => `
    <div class="analytics-ledger-row"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>
  `).join("");
}

function renderInteractionBreakdown(container, items) {
  if (!(container instanceof HTMLElement)) return;
  container.innerHTML = Array.isArray(items) && items.length > 0
    ? items.map((item) => `
      <div class="analytics-breakdown-item">
        <span>${escapeHtml(EVENT_LABELS[item.event] || item.event)}</span>
        <strong>${formatNumber(item.count)}</strong>
        <small>${formatNumber(item.sessions)} sessions</small>
      </div>
    `).join("")
    : renderEmpty();
}

function renderDiscoverySurfaces(container, items) {
  if (!(container instanceof HTMLElement)) return;
  container.innerHTML = Array.isArray(items) && items.length > 0
    ? `<div class="analytics-surface-list">${items.map((item) => `
        <div class="analytics-surface-item">
          <div class="analytics-surface-heading">
            <strong>${escapeHtml(formatDimension(item.surface))}</strong>
            <span>${formatNumber(item.interactions)} actions</span>
          </div>
          <div class="analytics-surface-bar"><span style="--bar-width: ${Math.min(100, Math.round((Number(item.interactions || 0) / Number(items[0]?.interactions || 1)) * 100))}%"></span></div>
          <small>${formatNumber(item.sessions)} sessions · ${formatNumber(item.showOpens)} show opens · ${formatNumber(item.listenClicks)} listens</small>
        </div>
      `).join("")}</div>`
    : renderEmpty("No discovery actions recorded in this range.");
}

function renderDiscoverySignals(container, metrics = {}) {
  if (!(container instanceof HTMLElement)) return;
  const keys = ["searches", "filterChanges", "collectionOpens", "showOpens"];
  container.innerHTML = `
    <div class="analytics-signal-grid">
      ${keys.map((key) => {
        const metric = metrics[key] || { label: key, value: 0 };
        return `
          <div class="analytics-signal-card">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${formatNumber(metric.value)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboard(payload, elements, rangeKey) {
  elements.summaryCards.innerHTML = renderSummaryCards(payload.metrics);
  renderChart(elements.trafficChart, payload.traffic, [
    { key: "pageViews", label: "Page views", tone: "red" },
    { key: "showPageViews", label: "Show pages", tone: "orange" },
    { key: "uniqueVisitors", label: "Visitors", tone: "blue" },
  ], rangeKey);
  renderChart(elements.interactionsChart, payload.interactionsOverTime, [
    { key: "interactions", label: "Actions", tone: "green" },
    { key: "showOpens", label: "Show opens", tone: "orange" },
    { key: "listenClicks", label: "Listen links", tone: "blue" },
  ], rangeKey);
  renderChart(elements.contributionsChart, payload.contributionsOverTime, [
    { key: "ratings", label: "Ratings", tone: "orange" },
    { key: "submissions", label: "Submissions", tone: "green" },
  ], rangeKey);
  renderRankedList(elements.topShows, payload.topShows, { emptyMessage: "No show engagement recorded in this range.", renderItem: renderTopShows });
  renderRankedList(elements.topCollections, payload.topCollections, { emptyMessage: "No collection engagement recorded in this range.", renderItem: renderTopCollection });
  renderRankedList(elements.topPages, payload.topPages, { emptyMessage: "No public page views recorded in this range.", renderItem: renderTopPage });
  renderRankedList(elements.mostRated, payload.mostRatedShows, { emptyMessage: "No active rating records yet.", renderItem: renderMostRated });
  renderRankedList(elements.sources, payload.sources, { emptyMessage: "No source data recorded in this range.", renderItem: renderSource });
  renderFunnel(elements.funnel, payload.funnel || {});
  renderRecordTotals(elements.recordTotals, payload.recordTotals || {});
  renderInteractionBreakdown(elements.interactionBreakdown, payload.interactionBreakdown);
  renderDiscoverySurfaces(elements.discoverySurfaces, payload.discoverySurfaces);
  renderDiscoverySignals(elements.discoverySignals, payload.metrics);

  const coverage = payload.coverage || {};
  const trackingStarted = formatDate(coverage.trackingStartedAt, { dateStyle: "medium" });
  const rangeStarted = formatDate(payload.range?.start, { dateStyle: "medium", timeStyle: "short" });
  const dataStarted = formatDate(coverage.rangeDataStartsAt, { dateStyle: "medium", timeStyle: "short" });
  elements.rangeMeta.textContent = `${payload.range?.label || "Selected range"} · updated ${formatDate(payload.generatedAt, { dateStyle: "medium", timeStyle: "short" })}`;
  elements.coverageMeta.textContent = dataStarted !== rangeStarted
    ? `Tracked since ${trackingStarted}; this range has data from ${dataStarted}.`
    : `Tracked since ${trackingStarted}. Historical trend data is not backfilled.`;
  const returning = payload.returningVisitors || {};
  elements.returningVisitors.textContent = `${formatNumber(returning.newVisitors)} new · ${formatNumber(returning.returningVisitors)} returning · approximate browser counts`;
  elements.coverageMeta.textContent += ` · ${formatNumber(coverage.retentionDays)}-day rolling retention.`;
  document.title = `${payload.range?.label || "Archive pulse"} · The Echo Archives`;
}

function getInitialRange() {
  const value = new URLSearchParams(window.location.search).get("range") || "7d";
  return RANGE_KEYS.has(value) ? value : "7d";
}

function syncRangeToUrl(range) {
  const params = new URLSearchParams(window.location.search);
  params.set("range", range);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

export async function initializeMaintainerAnalyticsPage() {
  if (!document.body.classList.contains("maintainer-analytics-page")) return;

  const elements = {
    appShell: document.getElementById("maintainerAppShell"),
    summaryCards: document.getElementById("maintainerSummaryCards"),
    trafficChart: document.getElementById("analyticsTrafficChart"),
    interactionsChart: document.getElementById("analyticsInteractionsChart"),
    contributionsChart: document.getElementById("analyticsContributionsChart"),
    topShows: document.getElementById("analyticsTopShows"),
    topCollections: document.getElementById("analyticsTopCollections"),
    topPages: document.getElementById("analyticsTopPages"),
    mostRated: document.getElementById("analyticsMostRated"),
    sources: document.getElementById("analyticsSources"),
    funnel: document.getElementById("analyticsFunnel"),
    recordTotals: document.getElementById("analyticsRecordTotals"),
    interactionBreakdown: document.getElementById("analyticsInteractionBreakdown"),
    discoverySurfaces: document.getElementById("analyticsDiscoverySurfaces"),
    discoverySignals: document.getElementById("analyticsDiscoverySignals"),
    rangeMeta: document.getElementById("analyticsRangeMeta"),
    coverageMeta: document.getElementById("analyticsCoverageMeta"),
    returningVisitors: document.getElementById("analyticsReturningVisitors"),
    refreshButton: document.getElementById("maintainerRefreshButton"),
    retryButton: document.getElementById("maintainerRetryButton"),
    rangeButtons: [...document.querySelectorAll("[data-analytics-range]")],
  };
  const view = getMaintainerViewElements(elements.appShell);
  const state = { range: getInitialRange(), hasBeenReady: false, controller: null };

  function setActiveRange() {
    elements.rangeButtons.forEach((button) => {
      const active = button.dataset.analyticsRange === state.range;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function showAuthentication(error = null) {
    state.controller?.abort();
    elements.refreshButton.hidden = true;
    const message = state.hasBeenReady
      ? "Your maintainer session expired. Sign in again to continue."
      : error instanceof Error ? error.message : "Sign in to continue.";
    setMaintainerViewState(view, "authRequired", { message });
    window.requestAnimationFrame(() => document.getElementById("maintainerPassphrase")?.focus());
  }

  async function loadDashboard({ afterAuthentication = false } = {}) {
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    setActiveRange();
    if (!state.hasBeenReady) {
      setMaintainerViewState(view, "loading", { message: "Loading the protected analytics dashboard…", retry: false });
    }
    try {
      const payload = await fetchMaintainerAnalytics(state.range, { signal: controller.signal });
      if (controller.signal.aborted) return;
      state.hasBeenReady = true;
      view.appShell.hidden = false;
      setMaintainerViewState(view, "ready");
      elements.refreshButton.hidden = false;
      renderDashboard(payload, elements, state.range);
      if (afterAuthentication) focusMaintainerWorkspace();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      if (!state.hasBeenReady) {
        setMaintainerViewState(view, "error", { message: error instanceof Error ? error.message : "The analytics dashboard could not be loaded." });
      } else {
        elements.coverageMeta.textContent = error instanceof Error ? error.message : "The analytics dashboard could not be refreshed.";
      }
    }
  }

  elements.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextRange = button.dataset.analyticsRange;
      if (!RANGE_KEYS.has(nextRange) || nextRange === state.range) return;
      state.range = nextRange;
      syncRangeToUrl(state.range);
      loadDashboard();
    });
  });
  elements.refreshButton.addEventListener("click", () => runMaintainerAction({
    control: elements.refreshButton,
    region: elements.appShell,
    action: () => loadDashboard(),
  }));
  elements.retryButton.addEventListener("click", () => loadDashboard());

  await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: () => loadDashboard({ afterAuthentication: true }),
    onLoggedOut: async () => {
      state.controller?.abort();
      state.hasBeenReady = false;
      elements.refreshButton.hidden = true;
      setMaintainerViewState(view, "authRequired", { message: "Signed out. Sign in to continue." });
    },
  });

  await loadDashboard();
}
