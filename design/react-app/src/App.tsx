import { useState, type ComponentType } from "react";
import { AppShell } from "./layout/AppShell";
import { navByMode } from "./layout/navConfig";
import type { PageId, SidebarMode } from "./shared/types";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { ShopsPage } from "./pages/shops/ShopsPage";
import { ListingsPage } from "./pages/listings/ListingsPage";
import { KeywordsPage } from "./pages/keywords/KeywordsPage";
import { ProfitCalculatorModal } from "./pages/calculator/ProfitCalculatorModal";
import { PlaceholderPage } from "./pages/PlaceholderPage";

/** Which component renders for a given page id. Adding a page means
 *  adding a row here (and to navConfig.ts) — App.tsx's own logic
 *  never has to change (Open/Closed). */
const pageComponents: Partial<Record<PageId, ComponentType>> = {
  dashboard: DashboardPage,
  shops: ShopsPage,
  listings: ListingsPage,
  keywords: KeywordsPage,
};

/** Nav items in this set open as a modal over the current page instead
 *  of navigating away — the sidebar doesn't need to know the difference,
 *  it just reports which id was clicked. */
const modalPageIds = new Set<PageId>(["calculator"]);

function findPageLabel(page: PageId): string {
  const allItems = [...navByMode.research, ...navByMode.manage];
  return allItems.find((item) => item.id === page)?.label ?? page;
}

export default function App() {
  const [mode, setMode] = useState<SidebarMode>("research");
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [openModal, setOpenModal] = useState<PageId | null>(null);

  function handleModeChange(nextMode: SidebarMode) {
    setMode(nextMode);
    setActivePage(navByMode[nextMode][0].id);
  }

  function handleSelectPage(page: PageId) {
    if (modalPageIds.has(page)) {
      setOpenModal(page);
      return;
    }
    setActivePage(page);
  }

  const ActivePageComponent = pageComponents[activePage];

  return (
    <>
      <AppShell
        mode={mode}
        activePage={activePage}
        currentPageLabel={findPageLabel(activePage)}
        onModeChange={handleModeChange}
        onSelectPage={handleSelectPage}
      >
        {ActivePageComponent ? <ActivePageComponent /> : <PlaceholderPage pageLabel={findPageLabel(activePage)} />}
      </AppShell>

      <ProfitCalculatorModal isOpen={openModal === "calculator"} onClose={() => setOpenModal(null)} />
    </>
  );
}
