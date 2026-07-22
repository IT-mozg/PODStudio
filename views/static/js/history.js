/* History tab: everything already generated, with regenerate/forget actions. */
"use strict";

import { $, api, toast, esc } from "./core.js";
import { wireImageModal } from "./imageModal.js";
import { openRegen } from "./regen.js";
import { loadListingsPage } from "./listings.js";

function historySig(h) {
  return `${h.date}|${h.file}|${h.background}|${h.custom_prompt}`;
}

function historyRowInner(h, cacheBust) {
  const img = h.file
    ? `<img src="/outputs/${encodeURIComponent(h.file)}?t=${cacheBust}" loading="lazy" alt="">`
    : `<div class="noimg">нема<br>файлу</div>`;
  const bg = h.background ? `<span class="bg-dot b-${h.background}"></span>` : "";
  const cp = h.custom_prompt ? "<span>свій промпт</span>" : "";
  return `${img}
    <div><div class="h-title">${esc(h.title)}</div>
      <div class="h-meta"><span>#${h.lid}</span><span>${h.date}</span>${bg}${cp}</div></div>
    <button class="ghost-btn" data-regen="${h.lid}">Перегенерувати</button>
    <button class="ghost-btn danger" data-forget="${h.lid}">Забути</button>`;
}

function wireHistoryRow(row, h) {
  row.querySelector("[data-regen]").addEventListener("click", () => openRegen(h.lid));
  row.querySelector("[data-forget]").addEventListener("click", () => forgetHistoryRow(h.lid, row));
  wireImageModal(row);
}

function animateRemoveRow(row) {
  row.classList.add("removing");
  const done = () => row.remove();
  row.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 400); // just in case transitionend never fires
}

async function forgetHistoryRow(lid, row) {
  try {
    await api("/api/forget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lid }),
    });
    animateRemoveRow(row);
    toast("Викинуто з історії — лістинг знову стане «новим»");
    loadListingsPage();
  } catch (e) { toast(e.message, true); }
}

export async function loadHistory() {
  const data = await api("/api/history");
  const list = data.history;
  $("historyEmpty").classList.toggle("hidden", list.length > 0);
  const container = $("historyList");
  const cacheBust = Date.now();
  const seen = new Set();
  let prevEl = null;
  list.forEach((h) => {
    seen.add(h.lid);
    const sig = historySig(h);
    let row = container.querySelector(`.hrow[data-lid="${CSS.escape(h.lid)}"]`);
    if (!row || row.dataset.sig !== sig) {
      // a new row, or the data actually changed (e.g. it was regenerated) -
      // only here is it justified to recreate the DOM/image
      const fresh = document.createElement("div");
      fresh.className = "hrow";
      fresh.dataset.lid = h.lid;
      fresh.dataset.sig = sig;
      fresh.innerHTML = historyRowInner(h, cacheBust);
      wireHistoryRow(fresh, h);
      if (row) row.replaceWith(fresh);
      row = fresh;
    }
    // unchanged - the DOM node stays the same, the image does not reload
    if (prevEl) prevEl.after(row); else container.prepend(row);
    prevEl = row;
  });
  container.querySelectorAll(".hrow").forEach((row) => {
    if (!seen.has(row.dataset.lid)) animateRemoveRow(row);
  });
}
