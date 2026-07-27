/* Listing pages: search, pagination, card rendering, selection. */
"use strict";

import { $, state, api, toast, esc } from "./core.js";
// Circular by design: generate.js imports loadListingsPage from here (to
// refresh cards after a job finishes) and this module imports updateRunbar
// from there (selection changes affect cost/count). Safe because both
// calls happen inside event handlers, well after both modules finish
// loading - not during the modules' own top-level evaluation.
import { updateRunbar } from "./generate.js";

// Guards against overlapping loads: firing a new search before the
// previous page load lands used to let whichever response arrived last
// win, even if it belonged to a load that's no longer relevant. Every load
// bumps this token and captures its own value; a load only applies its
// result if the token is still current by the time the network call
// resolves - anything superseded by a newer load silently discards itself
// instead of touching state or the DOM.
let loadToken = 0;

function wireSearch() {
  async function runSearch() {
    const query = $("searchQuery").value.trim();
    if (!query) { toast("Введи пошуковий запит", true); return; }
    $("searchBtn").disabled = true;
    try {
      await api("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      await loadPageFiles(0);
    } catch (e) {
      toast(e.message, true);
    } finally {
      $("searchBtn").disabled = false;
    }
  }
  $("searchBtn").addEventListener("click", runSearch);
  $("searchQuery").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); runSearch(); }
  });
}

export function setListingsBusy(isBusy) {
  document.body.classList.toggle("listings-busy", isBusy);
  $("listingsLoading").classList.toggle("hidden", !isBusy);
  $("listingsGrid").classList.toggle("busy", isBusy);
}

export async function loadPageFiles(jumpTo) {
  const token = ++loadToken;
  setListingsBusy(true);
  let data;
  try {
    data = await api("/api/pages");
  } catch (e) {
    if (token === loadToken) { toast(e.message, true); setListingsBusy(false); }
    return;
  }
  if (token !== loadToken) return; // a newer load started while this was in flight
  state.pageFiles = data.files;
  if (typeof jumpTo === "number") {
    state.pageIndex = jumpTo;
  } else if (state.pageIndex >= state.pageFiles.length) {
    state.pageIndex = Math.max(0, state.pageFiles.length - 1);
  }
  await loadListingsPage(token);
}

export async function loadListingsPage(token = ++loadToken) {
  setListingsBusy(true);
  const file = state.pageFiles[state.pageIndex];
  const url = file ? `/api/listings?file=${encodeURIComponent(file.name)}` : "/api/listings";
  let listings = [], cost = state.cost, errMsg = null;
  try {
    const data = await api(url);
    listings = file ? data.listings : [];
    cost = data.cost;
  } catch (e) {
    errMsg = e.message;
  }
  if (token !== loadToken) return; // a newer load started while this was in flight
  if (errMsg) toast(errMsg, true);
  state.listings = listings;
  state.cost = cost;
  renderListings();
  renderPagination();
  setListingsBusy(false);
}

// Etsy-style windowed pagination: a fixed-size band of page numbers
// centered on the current page (e.g. 3 4 [5] 6 7), not every page at once.
function pageWindow(current, total, radius = 2) {
  const size = radius * 2 + 1;
  let start = Math.max(0, current - radius);
  let end = Math.min(total - 1, current + radius);
  if (end - start + 1 < size) {
    if (start === 0) end = Math.min(total - 1, start + size - 1);
    else if (end === total - 1) start = Math.max(0, end - size + 1);
  }
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);
  return nums;
}

function renderPagination() {
  const n = state.pageFiles.length;
  $("pagesPagination").classList.toggle("hidden", n <= 1);
  $("pageLabel").classList.toggle("hidden", n === 0);
  const file = state.pageFiles[state.pageIndex];
  if (file) {
    $("pageLabel").textContent =
      `Сторінка ${state.pageIndex + 1} з ${n} — ${file.label || file.name} (${file.count})`;
  }
  $("pagPrev").disabled = state.pageIndex <= 0;
  $("pagNext").disabled = state.pageIndex >= n - 1;
  $("pagNumbers").innerHTML = pageWindow(state.pageIndex, n, 2).map((i) => {
    const f = state.pageFiles[i];
    return `<button class="ghost-btn pag-num${i === state.pageIndex ? " active" : ""}" data-idx="${i}" title="${esc(f.label || f.name)}">${i + 1}</button>`;
  }).join("");
  $("pagNumbers").querySelectorAll("[data-idx]").forEach((b) =>
    b.addEventListener("click", () => { state.pageIndex = Number(b.dataset.idx); loadListingsPage(); }));
}

function cardMarkup(l) {
  const sel = state.selected.has(l.lid) ? " selected" : "";
  const done = l.generated ? " done-before" : "";
  const chip = l.generated
    ? '<span class="chip gen">є в історії</span>'
    : '<span class="chip">новий</span>';
  const bg = l.background
    ? `<span class="bg-dot b-${l.background}" title="фон: ${l.background}"></span><span>${l.background}</span>`
    : "";
  const img = l.thumb ? `<img src="${esc(l.thumb)}" loading="lazy" alt="">` : "";
  const etsyLink = l.etsy_url
    ? `<a class="etsy-link" href="${esc(l.etsy_url)}" target="_blank" rel="noopener noreferrer">Etsy ↗</a>`
    : "";
  return `<div class="card${sel}${done}" data-lid="${l.lid}" tabindex="0" role="checkbox" aria-checked="${!!sel}">
    <div class="card-thumb">${img}<span class="card-check"></span>${chip}</div>
    <div class="card-body">
      <p class="card-title">${esc(l.title)}</p>
      <div class="card-meta"><span>#${l.lid}</span>${bg}${etsyLink}</div>
    </div></div>`;
}

function wireCards(grid) {
  grid.querySelectorAll(".card").forEach((card) => {
    const toggle = () => {
      const id = card.dataset.lid;
      state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
      card.classList.toggle("selected");
      card.setAttribute("aria-checked", state.selected.has(id));
      updateRunbar();
    };
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });
    const link = card.querySelector(".etsy-link");
    if (link) link.addEventListener("click", (e) => e.stopPropagation());
  });
  updateRunbar();
}

export function renderListings() {
  const grid = $("listingsGrid");
  $("listingsEmpty").classList.toggle("hidden", state.listings.length > 0);
  grid.innerHTML = state.listings.map(cardMarkup).join("");
  wireCards(grid);
}

export function initListings() {
  wireSearch();
  $("pagPrev").addEventListener("click", () => { state.pageIndex = Math.max(0, state.pageIndex - 1); loadListingsPage(); });
  $("pagNext").addEventListener("click", () => { state.pageIndex = Math.min(state.pageFiles.length - 1, state.pageIndex + 1); loadListingsPage(); });
  $("selectNew").addEventListener("click", () => {
    state.listings.forEach((l) => { if (!l.generated) state.selected.add(l.lid); });
    renderListings();
  });
  $("selectNone").addEventListener("click", () => {
    state.selected.clear();
    renderListings();
  });
}
