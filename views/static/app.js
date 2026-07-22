/* POD Studio — frontend */
"use strict";

const $ = (id) => document.getElementById(id);
const state = {
  listings: [],
  selected: new Set(),
  cost: {},
  polling: null,
  lastJobItems: [],
  lastResultsSig: null,   // avoid re-rendering "Results" if nothing changed
  pageFiles: [],   // [{name, count}, ...] - imported html pages
  pageIndex: 0,    // which one is currently shown
  budget: { balance: null, spent_since_sync: 0, remaining: null },
  genModalItems: [],
};

/* ---------------- utilities ---------------- */

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 4200);
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Помилка сервера (${res.status})`);
  return data;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  // textContent -> innerHTML escapes &/</> but not quotes, and this helper
  // is also used inside "..."-quoted HTML attributes (title, src, href)
  return d.innerHTML.replace(/"/g, "&quot;");
}

/* ---------------- tabs ---------------- */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("view-" + btn.dataset.tab).classList.add("active");
    $("controlsBar").style.display = btn.dataset.tab === "listings" ? "" : "none";
    if (btn.dataset.tab === "history") loadHistory();
  });
});

/* ---------------- search ---------------- */

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

/* ---------------- listings (pages of the current search) ---------------- */

async function loadPageFiles(jumpTo) {
  let data;
  try {
    data = await api("/api/pages");
  } catch (e) {
    toast(e.message, true);
    return;
  }
  state.pageFiles = data.files;
  if (typeof jumpTo === "number") {
    state.pageIndex = jumpTo;
  } else if (state.pageIndex >= state.pageFiles.length) {
    state.pageIndex = Math.max(0, state.pageFiles.length - 1);
  }
  await loadListingsPage();
}

async function loadListingsPage() {
  const file = state.pageFiles[state.pageIndex];
  const url = file ? `/api/listings?file=${encodeURIComponent(file.name)}` : "/api/listings";
  try {
    const data = await api(url);
    state.listings = file ? data.listings : [];
    state.cost = data.cost;
  } catch (e) {
    toast(e.message, true);
    state.listings = [];
  }
  renderListings();
  renderPagination();
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

$("pagPrev").addEventListener("click", () => { state.pageIndex = Math.max(0, state.pageIndex - 1); loadListingsPage(); });
$("pagNext").addEventListener("click", () => { state.pageIndex = Math.min(state.pageFiles.length - 1, state.pageIndex + 1); loadListingsPage(); });

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
  const badges = (l.hot || l.popular)
    ? `<div class="pop-badges">
         ${l.hot ? '<span class="pop-badge hot">🔥 Гаряче</span>' : ""}
         ${l.popular ? '<span class="pop-badge popular">★ Популярне</span>' : ""}
       </div>`
    : "";
  return `<div class="card${sel}${done}" data-lid="${l.lid}" tabindex="0" role="checkbox" aria-checked="${!!sel}">
    <div class="card-thumb">${img}<span class="card-check"></span>${chip}${badges}</div>
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

function renderListings() {
  const grid = $("listingsGrid");
  const shown = $("popularOnly").checked
    ? state.listings.filter((l) => l.hot || l.popular)
    : state.listings;
  $("listingsEmpty").classList.toggle("hidden", state.listings.length > 0);
  grid.innerHTML = shown.map(cardMarkup).join("");
  wireCards(grid);
}
$("popularOnly").addEventListener("change", renderListings);

$("selectNew").addEventListener("click", () => {
  state.listings.forEach((l) => { if (!l.generated) state.selected.add(l.lid); });
  renderListings();
});
$("selectNone").addEventListener("click", () => {
  state.selected.clear();
  renderListings();
});

/* ---------------- cost and launching ---------------- */

function estCost() {
  const model = $("modelSel").value;
  const q = $("qualitySel").value;
  const per = (state.cost[model] || {})[q] || 0;
  return state.selected.size * per;
}

function updateRunbar() {
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
$("modelSel").addEventListener("change", () => { updateRunbar(); updateGenerateModalCost(); });
$("qualitySel").addEventListener("change", () => { updateRunbar(); updateGenerateModalCost(); });

async function loadBudget() {
  try {
    state.budget = await api("/api/budget");
  } catch (e) { /* optional feature - silently ignore the error */ }
  updateRunbar();
}

/* ---------------- generate confirmation modal ---------------- */

$("generateBtn").addEventListener("click", openGenerateModal);

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

/* ---------------- progress and results ---------------- */

function startPolling() {
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

/* ---------------- fullscreen image preview modal ---------------- */

function wireImageModal(container) {
  container.querySelectorAll("img.pair-img, .hrow img, .source-thumb").forEach((img) => {
    if (img.dataset.zoomWired) return;
    img.dataset.zoomWired = "1";
    img.classList.add("zoomable");
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      $("imageModalImg").src = img.src;
      $("imageModal").classList.remove("hidden");
    });
  });
}

$("openFolder").addEventListener("click", () =>
  api("/api/open-folder", { method: "POST" }).catch((e) => toast(e.message, true)));

/* ---------------- regeneration ---------------- */

let regenLid = null;
let regenDefault = "";

async function openRegen(lid) {
  regenLid = lid;
  const data = await api("/api/prompt/" + lid);
  regenDefault = data.default_prompt;
  $("regenTitle").textContent = "Перегенерувати: " +
    (data.title.length > 48 ? data.title.slice(0, 48) + "…" : data.title);
  $("regenPrompt").value = data.prompt;
  document.querySelector('input[name="regenSource"][value="ref"]').checked = true;
  // defaults to whatever is selected in the control bar, but can be
  // changed here independently for this one regeneration
  $("regenModel").value = $("modelSel").value;
  $("regenQuality").value = $("qualitySel").value;
  $("regenRefThumb").src = data.ref_thumb || "";
  $("regenResultThumb").src = data.result_thumb || "";
  wireImageModal($("regenModal"));
  $("regenModal").classList.remove("hidden");
  updateRegenCost();
}

function updateRegenCost() {
  if ($("regenModal").classList.contains("hidden")) return;
  const model = $("regenModel").value;
  const q = $("regenQuality").value;
  const per = (state.cost[model] || {})[q] || 0;
  $("regenCost").textContent = `≈ $${per.toFixed(2)} · ${model} · ${q}`;
}
$("regenModel").addEventListener("change", updateRegenCost);
$("regenQuality").addEventListener("change", updateRegenCost);

$("regenReset").addEventListener("click", () => { $("regenPrompt").value = regenDefault; });

document.querySelectorAll('input[name="regenSource"]').forEach((r) =>
  r.addEventListener("change", () => {
    if (r.value === "result" && r.checked) {
      $("regenPrompt").value =
        "збережи цей дизайн максимально як є: та сама композиція, стиль і кольори\n" +
        "зміни тільки ось це: [опиши конкретну правку]\n" +
        "фон і решта елементів залишаються без змін\nбез ШІ-дефектів";
    } else if (r.checked) {
      $("regenPrompt").value = regenDefault;
    }
  }));

$("regenGo").addEventListener("click", async () => {
  try {
    const res = await api("/api/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lid: regenLid,
        prompt: $("regenPrompt").value,
        source: document.querySelector('input[name="regenSource"]:checked').value,
        model: $("regenModel").value,
        quality: $("regenQuality").value,
      }),
    });
    $("regenModal").classList.add("hidden");
    document.querySelector('[data-tab="results"]').click();
    startPolling();
    toast(res.queued ? "Додано в чергу" : "Перегенерація почалась");
  } catch (e) { toast(e.message, true); }
});

/* ---------------- history ---------------- */

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

async function loadHistory() {
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

/* ---------------- settings ---------------- */

$("settingsBtn").addEventListener("click", async () => {
  const s = await api("/api/settings");
  $("keyState").textContent = s.api_key_masked ? `(збережено: ${s.api_key_masked})` : "(ще не додано)";
  $("apiKeyInput").value = "";
  $("etsyKeyState").textContent = s.etsy_api_key_masked ? `(збережено: ${s.etsy_api_key_masked})` : "(ще не додано)";
  $("etsyKeyInput").value = "";
  $("etsySecretState").textContent = s.etsy_shared_secret_set ? "(збережено)" : "(ще не додано)";
  $("etsySecretInput").value = "";
  $("tplInput").value = s.prompt_template;
  $("tplInput").dataset.default = s.default_template;
  $("budgetInput").value = s.balance == null ? "" : s.balance;
  $("settingsModal").classList.remove("hidden");
});
$("tplReset").addEventListener("click", () => {
  $("tplInput").value = $("tplInput").dataset.default;
});
$("settingsSave").addEventListener("click", async () => {
  try {
    await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: $("apiKeyInput").value.trim(),
        etsy_api_key: $("etsyKeyInput").value.trim(),
        etsy_shared_secret: $("etsySecretInput").value.trim(),
        prompt_template: $("tplInput").value,
        balance: $("budgetInput").value.trim(),
      }),
    });
    $("settingsModal").classList.add("hidden");
    toast("Налаштування збережено");
    loadListingsPage();
    loadBudget();
  } catch (e) { toast(e.message, true); }
});

/* closing modals */
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".modal-back").classList.add("hidden")));
document.querySelectorAll(".modal-back").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));

/* ---------------- start ---------------- */

loadPageFiles().then(() => {
  // if a job is already running (e.g. the page was reloaded), pick up progress
  api("/api/job").then((j) => { if (j.running) startPolling(); });
}).catch((e) => toast(e.message, true));
loadBudget();
