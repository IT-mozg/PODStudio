/* Navigation is data, not markup. Adding a new page means adding a
   row here (icon, label, and now a route path) — Sidebar.tsx never
   needs to change (Open/Closed). */

import {
  DashboardIcon,
  ShopBagIcon,
  ListingsIcon,
  SearchIcon,
  CalculatorIcon,
  AssetsIcon,
  DesignsIcon,
  MockupsIcon,
  QueueIcon,
  TemplatesIcon,
} from "../shared/icons";
import type { NavItem, SidebarMode } from "../shared/types";

export const researchNav: NavItem[] = [
  { id: "dashboard", label: "Дашборд", icon: DashboardIcon, path: "/dashboard" },
  { id: "shops", label: "Магазини", icon: ShopBagIcon, path: "/shops" },
  { id: "listings", label: "Лістинги", icon: ListingsIcon, path: "/listings", badge: "NEW" },
  { id: "keywords", label: "Ключові слова", icon: SearchIcon, path: "/keywords" },
  { id: "calculator", label: "Калькулятор", icon: CalculatorIcon, path: "/calculator" },
];

export const manageNav: NavItem[] = [
  { id: "assets", label: "Асети", icon: AssetsIcon, path: "/assets" },
  { id: "designs", label: "Дизайни", icon: DesignsIcon, path: "/designs" },
  { id: "mockups", label: "Мокапи", icon: MockupsIcon, path: "/mockups" },
  { id: "myListings", label: "Лістинги (мої)", icon: ListingsIcon, path: "/my-listings" },
  { id: "publishQueue", label: "Черга публікації", icon: QueueIcon, path: "/publish-queue", badge: "3" },
  { id: "templates", label: "Шаблони", icon: TemplatesIcon, path: "/templates" },
];

export const navByMode: Record<SidebarMode, NavItem[]> = {
  research: researchNav,
  manage: manageNav,
};

const allNavItems = [...researchNav, ...manageNav];

/** Which nav item "owns" a given URL — exact match first, then the
 *  longest path prefix (so /shops/ct123 still highlights "Магазини"
 *  and reports the research mode as active). */
export function findNavItemForPath(pathname: string): NavItem | undefined {
  const exact = allNavItems.find((item) => item.path === pathname);
  if (exact) return exact;
  return allNavItems
    .filter((item) => pathname.startsWith(item.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export function modeForPath(pathname: string): SidebarMode {
  const item = findNavItemForPath(pathname);
  return item && manageNav.includes(item) ? "manage" : "research";
}
