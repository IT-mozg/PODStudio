/* Navigation is data, not markup. Adding a new page means adding a
   row here — Sidebar.tsx never needs to change (Open/Closed). */

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
  { id: "dashboard", label: "Дашборд", icon: DashboardIcon },
  { id: "shops", label: "Магазини", icon: ShopBagIcon },
  { id: "listings", label: "Лістинги", icon: ListingsIcon, badge: "NEW" },
  { id: "keywords", label: "Ключові слова", icon: SearchIcon },
  { id: "calculator", label: "Калькулятор", icon: CalculatorIcon },
];

export const manageNav: NavItem[] = [
  { id: "assets", label: "Асети", icon: AssetsIcon },
  { id: "designs", label: "Дизайни", icon: DesignsIcon },
  { id: "mockups", label: "Мокапи", icon: MockupsIcon },
  { id: "myListings", label: "Лістинги (мої)", icon: ListingsIcon },
  { id: "publishQueue", label: "Черга публікації", icon: QueueIcon, badge: "3" },
  { id: "templates", label: "Шаблони", icon: TemplatesIcon },
];

export const navByMode: Record<SidebarMode, NavItem[]> = {
  research: researchNav,
  manage: manageNav,
};
