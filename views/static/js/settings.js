/* Settings modal: API keys, prompt template, OpenAI balance. */
"use strict";

import { $, api, toast } from "./core.js";
import { loadListingsPage } from "./listings.js";
import { loadBudget } from "./generate.js";

export function initSettings() {
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
}
