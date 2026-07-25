/* Shared page chrome: sidebar Дослідження/Керування switch, sidebar
   navigation, and routing between page views. Page-specific behavior
   lives in dashboardPage.js / shopsPage.js. */

const pageViews = {};

export function registerPageView(pageName, element){
  pageViews[pageName] = element;
}

function showPageView(page){
  const contentArea = document.getElementById("contentArea");
  const genericPlaceholder = document.getElementById("genericPlaceholder");
  const view = pageViews[page] || null;

  Object.values(pageViews).forEach((el) => {
    if (el) el.style.display = el === view ? "" : "none";
  });
  genericPlaceholder.style.display = view ? "none" : "";
  contentArea.classList.toggle("centered", !view);
}

function selectNavItem(item){
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
  item.classList.add("active");
  const page = item.dataset.page;
  document.getElementById("crumbCurrent").textContent = page;
  document.getElementById("placeholderPage").textContent = page;
  showPageView(page);
}

export function initSidebarNav(){
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => selectNavItem(item));
  });
}

export function initModeSwitch(){
  const modeBtns = document.querySelectorAll(".mode-btn");
  const navGroups = document.querySelectorAll(".nav-group");

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      navGroups.forEach((g) => {
        g.style.display = g.dataset.group === mode ? "" : "none";
      });
      const activeItem = document.querySelector(`.nav-group[data-group="${mode}"] .nav-item.active`)
        || document.querySelector(`.nav-group[data-group="${mode}"] .nav-item`);
      if (activeItem) selectNavItem(activeItem);
    });
  });
}
