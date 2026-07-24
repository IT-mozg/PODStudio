import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { ShopsPage } from "./pages/shops/ShopsPage";
import { ShopDetailPage } from "./pages/shops/ShopDetailPage";
import { ListingsPage } from "./pages/listings/ListingsPage";
import { ListingDetailPage } from "./pages/listings/ListingDetailPage";
import { KeywordsPage } from "./pages/keywords/KeywordsPage";
import { ProfitCalculatorModal } from "./pages/calculator/ProfitCalculatorModal";
import { PlaceholderPage } from "./pages/PlaceholderPage";

interface LocationState {
  backgroundLocation?: Location;
}

/** The calculator is a route (/calculator) so it's linkable and shows
 *  up in the sidebar like any other nav item, but visually it should
 *  still float as a modal over whatever page was open. The "background
 *  location" pattern below does exactly that: when Sidebar navigates to
 *  /calculator it stashes the previous location in router state, so the
 *  page Routes keep rendering that previous page underneath while a
 *  second, unconditional Routes renders the modal on top. Reaching
 *  /calculator directly (e.g. a reload) has no stashed background, so it
 *  just falls back to a plain page render. */
function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <>
      <AppShell>
        <Routes location={backgroundLocation ?? location}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/shops" element={<ShopsPage />} />
          <Route path="/shops/:shopId" element={<ShopDetailPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/listings/:listingId" element={<ListingDetailPage />} />
          <Route path="/keywords" element={<KeywordsPage />} />
          <Route path="/calculator" element={<PlaceholderPage pageLabel="Калькулятор" />} />
          <Route path="/assets" element={<PlaceholderPage pageLabel="Асети" />} />
          <Route path="/designs" element={<PlaceholderPage pageLabel="Дизайни" />} />
          <Route path="/mockups" element={<PlaceholderPage pageLabel="Мокапи" />} />
          <Route path="/my-listings" element={<PlaceholderPage pageLabel="Лістинги (мої)" />} />
          <Route path="/publish-queue" element={<PlaceholderPage pageLabel="Черга публікації" />} />
          <Route path="/templates" element={<PlaceholderPage pageLabel="Шаблони" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>

      {backgroundLocation && (
        <Routes>
          <Route path="/calculator" element={<ProfitCalculatorModal isOpen onClose={() => navigate(-1)} />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
