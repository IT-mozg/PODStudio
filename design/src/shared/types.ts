/* Types shared across layout and pages. Page-local types (e.g. Shop)
   live next to the page that owns them (shops/types.ts), not here —
   this file is only for things more than one module depends on. */

import type { ComponentType } from "react";

export type SidebarMode = "research" | "manage";

export type PageId =
  | "dashboard"
  | "shops"
  | "listings"
  | "keywords"
  | "calculator"
  | "assets"
  | "designs"
  | "mockups"
  | "myListings"
  | "publishQueue"
  | "templates";

export interface NavItem {
  id: PageId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Route this nav item links to — the single source of truth for
   *  "what's active" (derived from the URL, not a separate state flag). */
  path: string;
  badge?: string;
}
