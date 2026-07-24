/* Магазини page: Пошук / Відстежувані tabs, filter chips, and the
   search results table (data-driven — rows render from SEARCH_RESULT_SHOPS). */

import { registerPageView } from "./layout.js";

const SEARCH_RESULT_SHOPS = [
  { id:"ct", initials:"CT", name:"CatTeesShop", listings:128, ageMonths:34, niche:"funny cat", sales:"3 803 985", revenue:"$1.2M", rating:4.83, reviews:"221.6k", growth:"+34%", tracked:true },
  { id:"vg", initials:"VG", name:"VintageGlowPrints", listings:312, ageMonths:61, niche:"retro / vintage", sales:"167 370", revenue:"$420k", rating:4.87, reviews:"42.5k", growth:"+21%", tracked:false },
  { id:"kk", initials:"KK", name:"KrispKiwiStudio", listings:94, ageMonths:28, niche:"dog mom", sales:"76 109", revenue:"$190k", rating:4.81, reviews:"22.4k", growth:"+18%", tracked:false },
  { id:"os", initials:"OS", name:"OldSchoolCulture", listings:201, ageMonths:45, niche:"minimalist", sales:"820 896", revenue:"$2.1M", rating:4.87, reviews:"119.4k", growth:"+11%", tracked:false },
];

const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3 6.5 7 1-5 5 1.3 7L12 18l-6.3 3.5 1.3-7-5-5 7-1Z"></path></svg>';
const ICON_GROWTH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 17 17 7M7 7h10v10"></path></svg>';

function renderShopRow(shop){
  return `
    <tr data-shop-id="${shop.id}">
      <td>
        <div class="shop-cell">
          <div class="shop-avatar">${shop.initials}</div>
          <div>
            <div class="shop-cell-name">${shop.name}</div>
            <div class="shop-cell-age">${shop.listings} лістингів · ${shop.ageMonths} міс.</div>
          </div>
        </div>
      </td>
      <td><span class="niche-tag">${shop.niche}</span></td>
      <td><div class="table-num">${shop.sales}</div></td>
      <td><div class="table-num">${shop.revenue}</div></td>
      <td>
        <div class="table-num">${shop.rating}</div>
        <div class="table-num-sub">${shop.reviews} відгуків</div>
      </td>
      <td><div class="trend-growth">${ICON_GROWTH}${shop.growth}</div></td>
      <td>
        <div class="row-actions">
          <div class="row-star ${shop.tracked ? "active" : ""}" title="${shop.tracked ? "У відстежуваних" : "Додати у відстежувані"}">${ICON_STAR}</div>
        </div>
      </td>
    </tr>`;
}

function renderShopResults(shops){
  const tbody = document.getElementById("shopResultsBody");
  if (!tbody) return;
  tbody.innerHTML = shops.map(renderShopRow).join("");
  initWatchlistStars();
}

function initWatchlistStars(){
  document.querySelectorAll(".row-star").forEach((star) => {
    star.addEventListener("click", () => {
      star.classList.toggle("active");
      star.title = star.classList.contains("active") ? "У відстежуваних" : "Додати у відстежувані";
    });
  });
}

function initShopTabs(){
  document.querySelectorAll(".seg-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".seg-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.shoptab;
      document.querySelectorAll(".shop-panel").forEach((p) => {
        p.style.display = p.dataset.shoppanel === target ? "" : "none";
      });
    });
  });
}

function initFilterChips(){
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });
}

export function initShopsPage(){
  registerPageView("Магазини", document.getElementById("shopsView"));
  initShopTabs();
  initFilterChips();
  renderShopResults(SEARCH_RESULT_SHOPS);
}
