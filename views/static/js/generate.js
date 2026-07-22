/* Cost estimation, the generate confirmation modal, job polling, and
   rendering the Results tab. */
"use strict";

import { $, state, api, toast, esc } from "./core.js";
import { loadListingsPage } from "./listings.js";
import { loadHistory } from "./history.js";
import { wireImageModal } from "./imageModal.js";
import { openRegen, initRegen } from "./regen.js";

export function estCost() {
  const model = $("modelSel").value;
  const q = $("qualitySel").value;
  const per = (state.cost[model] || {})[q] || 0;
  return state.selected.size * per;
}

export function updateRunbar() {
  $("selCount").textContent = state.selected.size;
  const cost = estCost();
  $("costStamp").textContent = "≈ $" + cost.toFixed(2);
  // generation can be queued while another one is running - don't disable the button
  $("generateBtn").disabled = state.selected.size === 0;

  const balance = state.budget.balance;
  const budgetEl = $("budgetStamp");
  if (balance == null) {
    budgetEl.classList.add("hidden");
  } else {
    const remaining = balance - state.budget.spent_since_sync - cost;
    budgetEl.classList.remove("hidden");
    budgetEl.textContent = `залишилось ≈ $${remaining.toFixed(2)} (баланс $${balance.toFixed(2)})`;
  }
}

export async function loadBudget() {
  try {
    state.budget = await api("/api/budget");
  } catch (e) { /* optional feature - silently ignore the error */ }
  updateRunbar();
}

/* ---------------- generate confirmation modal ---------------- */

async function openGenerateModal() {
  const ids = [...state.selected];
  if (!ids.length) return;
  let data;
  try {
    data = await api("/api/listing-info?lids=" + ids.map(encodeURIComponent).join(","));
  } catch (e) { toast(e.message, true); return; }
  state.genModalItems = data.listings;
  $("genModalCount").textContent = `(${state.genModalItems.length})`;
  $("generateModal").classList.remove("hidden");
  renderGenerateModal();
}

function renderGenerateModal() {
  $("genModalList").innerHTML = state.genModalItems.map((l) => `
    <div class="gen-row" data-lid="${l.lid}">
      ${l.thumb ? `<img src="${esc(l.thumb)}" loading="lazy" alt="">` : `<div class="noimg"></div>`}
      <div>
        <p class="gen-row-title">${esc(l.title)}</p>
        <textarea rows="4" spellcheck="false">${esc(l.prompt)}</textarea>
      </div>
    </div>`).join("");
  updateGenerateModalCost();
}

function updateGenerateModalCost() {
  if ($("generateModal").classList.contains("hidden")) return;
  const model = $("modelSel").value;
  const q = $("qualitySel").value;
  const per = (state.cost[model] || {})[q] || 0;
  const n = state.genModalItems.length;
  $("genModalCost").textContent = `≈ $${(per * n).toFixed(2)} · ${n} дизайнів`;
}

/* ---------------- progress and results ---------------- */

export function startPolling() {
  if (state.polling) clearInterval(state.polling);
  $("progressWrap").classList.remove("hidden");
  state.lastResultsSig = null;
  state.polling = setInterval(pollJob, 1600);
  pollJob();
}

async function pollJob() {
  const job = await api("/api/job");
  state.lastJobItems = job.items || [];
  renderResults(job);
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  $("progressFill").style.width = pct + "%";
  $("progressText").textContent =
    `${job.done}/${job.total} · ok ${job.ok} · помилок ${job.fail}`;
  if (!job.running && job.total > 0 && job.done >= job.total) {
    clearInterval(state.polling);
    state.polling = null;
    $("progressWrap").classList.add("hidden");
    toast(`Готово: ${job.ok} успішно` + (job.fail ? `, ${job.fail} з помилками` : ""));
    state.selected.clear();
    loadListingsPage();
    loadHistory();
    loadBudget();
  } else if (!job.running && job.total === 0) {
    clearInterval(state.polling);
    state.polling = null;
    $("progressWrap").classList.add("hidden");
  }
  updateRunbar();
}

function resultsSignature(items) {
  return items.map((i) => `${i.lid}:${i.status}:${i.out_file || ""}:${i.error || ""}`).join("|");
}

function renderResults(job) {
  const items = job.items || [];
  $("resultsBadge").textContent = items.filter((i) => i.status === "ok").length;
  $("resultsBadge").classList.toggle("hidden", items.length === 0);
  $("resultsEmpty").classList.toggle("hidden", items.length > 0);
  // if no status changed since last time, don't touch the DOM/images at all
  // (this is what caused that constant "flicker" while polling)
  const sig = resultsSignature(items);
  if (sig === state.lastResultsSig) return;
  state.lastResultsSig = sig;
  $("resultsList").innerHTML = items.map((it) => {
    const ref = `/refs/${it.lid}.jpg?${it.status}`;
    let right, meta = "", cls = "";
    if (it.status === "ok") {
      right = `<img class="pair-img" src="/outputs/${encodeURIComponent(it.out_file)}?t=${Date.now() % 1e6}" alt="результат">`;
      meta = `<span class="bg-dot b-${it.background}"></span><span>фон: ${it.background}</span>`;
    } else if (it.status === "fail") {
      right = `<div class="pair-img" style="display:flex;align-items:center;justify-content:center;color:var(--bad)">✕</div>`;
      meta = `<span class="err">${esc(it.error)}</span>`;
      cls = " failed";
    } else {
      right = `<div class="pair-img" style="display:flex;align-items:center;justify-content:center"><span class="spin"></span></div>`;
      meta = `<span>${it.status === "wait" ? "у черзі…" : "генерується…"}</span>`;
    }
    const actions = it.status === "ok" || it.status === "fail"
      ? `<div class="pair-actions">
           <button class="ghost-btn" data-regen="${it.lid}">Перегенерувати</button>
         </div>` : "";
    return `<div class="pair${cls}">
      <img class="pair-img" src="${ref}" alt="референс" onerror="this.style.visibility='hidden'">
      <div class="pair-arrow">→</div>
      ${right}
      <div class="pair-info">
        <span class="pair-title">${esc(it.title)}</span>
        <div class="pair-meta"><span>#${it.lid}</span>${meta}</div>
        ${actions}
      </div></div>`;
  }).join("");
  $("resultsList").querySelectorAll("[data-regen]").forEach((b) =>
    b.addEventListener("click", () => openRegen(b.dataset.regen)));
  wireImageModal($("resultsList"));
}

export function initGenerate() {
  $("modelSel").addEventListener("change", () => { updateRunbar(); updateGenerateModalCost(); });
  $("qualitySel").addEventListener("change", () => { updateRunbar(); updateGenerateModalCost(); });

  $("generateBtn").addEventListener("click", openGenerateModal);

  $("genModalGo").addEventListener("click", async () => {
    const items = [...document.querySelectorAll("#genModalList .gen-row")].map((row) => ({
      lid: row.dataset.lid,
      prompt: row.querySelector("textarea").value,
    }));
    try {
      const res = await api("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items, model: $("modelSel").value, quality: $("qualitySel").value,
        }),
      });
      $("generateModal").classList.add("hidden");
      document.querySelector('[data-tab="results"]').click();
      startPolling();
      if (res.queued) toast(`Додано в чергу: ${res.started}`);
    } catch (e) { toast(e.message, true); }
  });

  $("stopBtn").addEventListener("click", async () => {
    await api("/api/stop", { method: "POST" });
    toast("Зупиняю — поточні картинки завершаться і все стане");
  });

  $("openFolder").addEventListener("click", () =>
    api("/api/open-folder", { method: "POST" }).catch((e) => toast(e.message, true)));

  initRegen(startPolling);
}
