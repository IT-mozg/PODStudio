/* Entry point: tab switching, modal-close wiring, and app bootstrap. Each
   feature area (listings, sourceControl, generate, history, settings) owns
   its own DOM wiring - this file only ties the top-level page chrome
   together and kicks off the initial load. */
"use strict";

import { $, api, toast } from "./core.js";
import { initListings, loadPageFiles } from "./listings.js";
import { initSourceControl } from "./sourceControl.js";
import { initGenerate, loadBudget, startPolling } from "./generate.js";
import { initSettings } from "./settings.js";
import { loadHistory } from "./history.js";
import { initEditing, loadEditImages } from "./editing.js";

/* ---------------- tabs ---------------- */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("view-" + btn.dataset.tab).classList.add("active");
    $("controlsBar").style.display = btn.dataset.tab === "listings" ? "" : "none";
    $("runbar").classList.toggle("hidden", btn.dataset.tab === "editing");
    $("editRunbar").classList.toggle("hidden", btn.dataset.tab !== "editing");
    if (btn.dataset.tab === "history") loadHistory();
    if (btn.dataset.tab === "editing") loadEditImages();
  });
});

/* ---------------- modals ---------------- */

document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".modal-back").classList.add("hidden")));
document.querySelectorAll(".modal-back").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));

/* ---------------- bootstrap ---------------- */

initListings();
initSourceControl();
initGenerate();
initSettings();
initEditing();

loadPageFiles().then(() => {
  // if a job is already running (e.g. the page was reloaded), pick up progress
  api("/api/job").then((j) => { if (j.running) startPolling(); });
}).catch((e) => toast(e.message, true));
loadBudget();
