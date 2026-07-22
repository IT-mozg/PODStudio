/* Regeneration modal - opened from both the Results tab and the History
   tab, so it lives in its own module rather than inside either. */
"use strict";

import { $, state, api, toast } from "./core.js";
import { wireImageModal } from "./imageModal.js";

let regenLid = null;
let regenDefault = "";

export async function openRegen(lid) {
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

/* onQueued: called after a successful regenerate submit (starts polling -
   injected by generate.js rather than imported, so this module does not
   need to depend on generate.js at all). */
export function initRegen(onQueued) {
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
      onQueued();
      toast(res.queued ? "Додано в чергу" : "Перегенерація почалась");
    } catch (e) { toast(e.message, true); }
  });
}
