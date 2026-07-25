/* Entry point: wires shared chrome + each page module together,
   mirroring the real app's views/static/js/main.js structure. */

import { initModeSwitch, initSidebarNav } from "./layout.js";
import { initDashboardPage } from "./dashboardPage.js";
import { initShopsPage } from "./shopsPage.js";

initDashboardPage();
initShopsPage();

initModeSwitch();
initSidebarNav();
