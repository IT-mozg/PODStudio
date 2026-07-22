/* Shared utilities and app state - the one module every other module may
   depend on (nothing here imports from elsewhere in the app). */
"use strict";

export const $ = (id) => document.getElementById(id);

export const state = {
  listings: [],
  selected: new Set(),
  cost: {},
  polling: null,
  lastJobItems: [],
  lastResultsSig: null,   // avoid re-rendering "Results" if nothing changed
  pageFiles: [],   // [{name, count}, ...] - pages of the active listing source
  pageIndex: 0,    // which one is currently shown
  budget: { balance: null, spent_since_sync: 0, remaining: null },
  genModalItems: [],
  activeSource: "etsy_search",
};

export function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 4200);
}

export async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Помилка сервера (${res.status})`);
  return data;
}

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  // textContent -> innerHTML escapes &/</> but not quotes, and this helper
  // is also used inside "..."-quoted HTML attributes (title, src, href)
  return d.innerHTML.replace(/"/g, "&quot;");
}
