/* Editing tab: browse output/ images, pick a batch, tune the halftone-mask
   settings (mirrors CFG in POD_Halftone_Mask.jsx), and run one of the three
   POD_Halftone_Mask.jsx branches (sketch_black/sketch_white/illustration)
   against api("/api/edit/apply"). */
"use strict";

import { $, api, toast, esc } from "./core.js";

const editSelected = new Set();
let editImages = [];

const FIELD_MAP = {
  auto_detect: ["editAutoDetect", "checkbox"],
  force_type: ["editForceType", "select-empty-null"],
  sat_threshold: ["editSatThreshold", "number"],
  white_lum_threshold: ["editWhiteLum", "number"],
  black_lum_threshold: ["editBlackLum", "number"],

  bitmap_method: ["editBitmapMethod", "text"],
  halftone_frequency: ["editHalftoneFrequency", "number"],
  halftone_angle: ["editHalftoneAngle", "number"],
  halftone_shape: ["editHalftoneShape", "text"],

  levels_black: ["editLevelsBlack", "number"],
  levels_white: ["editLevelsWhite", "number"],
  levels_gamma: ["editLevelsGamma", "number"],

  brighten_design: ["editBrightenDesign", "checkbox"],
  brightness: ["editBrightness", "number"],
  contrast: ["editContrast", "number"],
  shadow_lift: ["editShadowLift", "number"],
  fade_black: ["editFadeBlack", "number"],
  saturation: ["editSaturation", "number"],

  target_dpi: ["editTargetDpi", "number"],

  upscale_model: ["editUpscaleModel", "text"],
  upscale_scale: ["editUpscaleScale", "number"],
};

let upscaleModelsLoaded = false;

async function ensureUpscaleModelsLoaded() {
  if (upscaleModelsLoaded) return;
  try {
    const data = await api("/api/edit/upscale-models");
    $("editUpscaleModel").innerHTML = data.models
      .map((m) => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join("");
    upscaleModelsLoaded = true;
  } catch (e) { toast(e.message, true); }
}

function fillSettingsForm(settings) {
  for (const [key, [id, kind]] of Object.entries(FIELD_MAP)) {
    const el = $(id);
    const val = settings[key];
    if (kind === "checkbox") el.checked = !!val;
    else if (kind === "select-empty-null") el.value = val || "";
    else el.value = val;
  }
}

function readSettingsForm() {
  const out = {};
  for (const [key, [id, kind]] of Object.entries(FIELD_MAP)) {
    const el = $(id);
    if (kind === "checkbox") out[key] = el.checked;
    else if (kind === "select-empty-null") out[key] = el.value || null;
    else if (kind === "number") out[key] = el.value === "" ? null : Number(el.value);
    else out[key] = el.value;
  }
  return out;
}

async function openEditSettings() {
  try {
    await ensureUpscaleModelsLoaded();
    const settings = await api("/api/edit/settings");
    fillSettingsForm(settings);
    $("editSettingsModal").classList.remove("hidden");
  } catch (e) { toast(e.message, true); }
}

async function saveEditSettings() {
  try {
    await api("/api/edit/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readSettingsForm()),
    });
    $("editSettingsModal").classList.add("hidden");
    toast("Налаштування збережено");
  } catch (e) { toast(e.message, true); }
}

function rowMarkup(img) {
  const isSel = editSelected.has(img.name);
  const dims = img.width
    ? `${img.width}×${img.height} · ${img.dpi} DPI · ${esc(img.colorspace)}`
    : "";
  return `<div class="edit-row${isSel ? " selected" : ""}" data-name="${esc(img.name)}" tabindex="0" role="checkbox" aria-checked="${isSel}">
    <img class="edit-thumb" src="${esc(img.thumb)}" loading="lazy" alt="">
    <div class="edit-info">
      <p class="edit-title" title="${esc(img.name)}">${esc(img.name)}</p>
      <div class="edit-badges">
        <span class="edit-badge ext">${esc(img.ext)}</span>
        <span class="edit-badge size">${img.size_mb} MB</span>
        <span class="edit-dims">${dims}</span>
      </div>
    </div></div>`;
}

function updateEditRunbar() {
  const n = editSelected.size;
  $("editSelCount").textContent = n;
  document.querySelectorAll("#editToolbar [data-type], #editDeselect")
    .forEach((btn) => { btn.disabled = n === 0; });
  const allSelected = editImages.length > 0 && n === editImages.length;
  $("editSelectAllCheck").checked = allSelected;
  $("editSelectAllCheck").indeterminate = n > 0 && !allSelected;
  $("editSelectAllLabel").textContent = allSelected ? "Зняти всі" : "Вибрати всі";
}

function wireRows(grid) {
  grid.querySelectorAll(".edit-row").forEach((row) => {
    const toggle = () => {
      const name = row.dataset.name;
      editSelected.has(name) ? editSelected.delete(name) : editSelected.add(name);
      row.classList.toggle("selected");
      row.setAttribute("aria-checked", editSelected.has(name));
      updateEditRunbar();
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });
  });
}

function renderEditGrid() {
  const grid = $("editingGrid");
  $("editingEmpty").classList.toggle("hidden", editImages.length > 0);
  grid.innerHTML = editImages.map(rowMarkup).join("");
  wireRows(grid);
  updateEditRunbar();
}

export async function loadEditImages() {
  try {
    const data = await api("/api/edit/images");
    const names = new Set(data.images.map((i) => i.name));
    for (const n of [...editSelected]) if (!names.has(n)) editSelected.delete(n);
    editImages = data.images;
    renderEditGrid();
  } catch (e) { toast(e.message, true); }
}

const RESULT_LABEL = {
  sketch_black: "Halftone", sketch_white: "Halftone", illustration: "Без фону",
  upscale: "Апскейл",
};

function compareMarkup(originalThumb, resultUrl, label) {
  return `<div class="compare-col">
      <span class="compare-label">Оригінал</span>
      <img src="${esc(originalThumb)}" alt="">
    </div>
    <div class="compare-arrow">→</div>
    <div class="compare-col">
      <span class="compare-label">${esc(label)}</span>
      <div class="compare-checker"><img src="${esc(resultUrl)}" alt=""></div>
    </div>
    <button class="icon-btn compare-close" aria-label="Закрити" title="Закрити">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
    </button>`;
}

function showCompare(name, resultUrl, type) {
  const grid = $("editingGrid");
  const row = grid.querySelector(`.edit-row[data-name="${CSS.escape(name)}"]`);
  const img = editImages.find((i) => i.name === name);
  if (!row || !img) return;

  let block = grid.querySelector(`.edit-compare[data-compare="${CSS.escape(name)}"]`);
  if (!block) {
    block = document.createElement("div");
    block.className = "edit-compare";
    block.dataset.compare = name;
    row.after(block);
  }
  block.innerHTML = compareMarkup(img.thumb, `${resultUrl}?t=${Date.now()}`, RESULT_LABEL[type] || "Результат");
  block.querySelector(".compare-close").addEventListener("click", (e) => {
    e.stopPropagation();
    block.remove();
  });
}

function setToolbarBusy(isBusy) {
  document.querySelectorAll("#editToolbar button").forEach((b) => { b.disabled = isBusy; });
  $("editSelectAllCheck").disabled = isBusy;
}

async function applyType(type) {
  setToolbarBusy(true);
  toast(type === "upscale"
    ? "Апскейлимо… ~30-60с на зображення (перший запуск довше - якщо ще не завантажено бінарник/модель)"
    : "Обробляємо…");
  try {
    const data = await api("/api/edit/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [...editSelected], type }),
    });
    (data.results || []).forEach((r) => showCompare(r.name, r.result, type));
    if (data.errors && data.errors.length) {
      toast(data.errors.map((e) => `${e.name}: ${e.error}`).join(" · "), true);
    } else {
      toast(`Оброблено: ${data.results.length}`);
    }
  } catch (e) { toast(e.message, true); }
  finally { $("editSelectAllCheck").disabled = false; updateEditRunbar(); }
}

export function initEditing() {
  $("editSelectAllCheck").addEventListener("change", () => {
    if ($("editSelectAllCheck").checked) editImages.forEach((i) => editSelected.add(i.name));
    else editSelected.clear();
    renderEditGrid();
  });
  $("editSettingsBtn").addEventListener("click", openEditSettings);
  $("editSettingsSave").addEventListener("click", saveEditSettings);
  $("editDeselect").addEventListener("click", () => {
    editSelected.clear();
    renderEditGrid();
  });
  document.querySelectorAll("#editToolbar [data-type]").forEach((btn) => {
    btn.addEventListener("click", () => applyType(btn.dataset.type));
  });
}
