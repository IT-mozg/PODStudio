/* Дашборд page. Currently static mock content — no dynamic data yet.
   Kept as its own module (instead of inline markup logic) so future
   widgets (live stats, queue actions) have a home without touching
   shopsPage.js or layout.js. */

import { registerPageView } from "./layout.js";

export function initDashboardPage(){
  registerPageView("Дашборд", document.getElementById("dashboardView"));
}
