/* Fullscreen image preview - reused by results, history, and the
   regeneration modal, so any <img class="pair-img|source-thumb"> or image
   inside .hrow gets click-to-zoom for free. */
"use strict";

import { $ } from "./core.js";

export function wireImageModal(container) {
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
