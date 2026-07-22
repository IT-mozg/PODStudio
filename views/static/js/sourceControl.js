/* Which listing source is active (live Etsy search vs. manually saved
   pages) and the two ways of feeding it: the search bar, and the
   drag-and-drop/upload zone. Adding a third source later means adding one
   more tab button + panel in index.html and one more wireX() here - the
   rest of the app (listings.js, generate.js, ...) only ever reads
   state.pageFiles/state.listings and does not care which source filled them. */
"use strict";

import { $, state, api, toast } from "./core.js";
import { loadPageFiles, setListingsBusy } from "./listings.js";

const PANEL_BY_SOURCE = { etsy_search: "panel-etsy_search", saved_pages: "panel-saved_pages" };

function applyActiveSource(id) {
  state.activeSource = id;
  document.querySelectorAll(".source-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.source === id));
  Object.entries(PANEL_BY_SOURCE).forEach(([sid, panelId]) =>
    $(panelId).classList.toggle("hidden", sid !== id));
}

async function switchSource(id) {
  if (id === state.activeSource) return;
  // Locked here already (not just once loadPageFiles gets to it below) so
  // the tabs can't be clicked again while the /api/sources switch itself is
  // still in flight - that gap was exactly how a fast back-and-forth click
  // used to start two overlapping loads racing each other.
  setListingsBusy(true);
  try {
    await api("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (e) { toast(e.message, true); setListingsBusy(false); return; }
  applyActiveSource(id);
  state.selected.clear();
  await loadPageFiles(0);
}

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

async function uploadFiles(files) {
  const fd = new FormData();
  [...files].forEach((f) => fd.append("files", f));
  try {
    const res = await api("/api/upload", { method: "POST", body: fd });
    toast(`Додано сторінок: ${res.saved}`);
    const data = await api("/api/pages");
    loadPageFiles(Math.max(0, data.files.length - 1));
  } catch (e) { toast(e.message, true); }
  $("fileInput").value = "";
}

function wireUpload() {
  const drop = $("dropZone");
  drop.addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", () => uploadFiles($("fileInput").files));
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => uploadFiles(e.dataTransfer.files));
}

export async function initSourceControl() {
  document.querySelectorAll(".source-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchSource(btn.dataset.source));
  });
  wireSearch();
  wireUpload();
  try {
    const data = await api("/api/sources");
    applyActiveSource(data.active);
  } catch (e) { /* keep the default etsy_search UI if this fails */ }
}
