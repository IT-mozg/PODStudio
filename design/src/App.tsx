import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { LoadingState } from "./shared/components/LoadingState";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";

/** Each route's page loads as its own chunk instead of all of them
 *  shipping in the initial bundle — the sidebar/topbar shell and
 *  whichever single page is open are all a first visit needs. */
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ShopsPage = lazy(() => import("./pages/shops/ShopsPage").then((m) => ({ default: m.ShopsPage })));
const ShopDetailPage = lazy(() => import("./pages/shops/ShopDetailPage").then((m) => ({ default: m.ShopDetailPage })));
const ListingsPage = lazy(() => import("./pages/listings/ListingsPage").then((m) => ({ default: m.ListingsPage })));
const ListingDetailPage = lazy(() => import("./pages/listings/ListingDetailPage").then((m) => ({ default: m.ListingDetailPage })));
const KeywordsPage = lazy(() => import("./pages/keywords/KeywordsPage").then((m) => ({ default: m.KeywordsPage })));
const ProfitCalculatorModal = lazy(() =>
  import("./pages/calculator/ProfitCalculatorModal").then((m) => ({ default: m.ProfitCalculatorModal }))
);

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
  const pageLocation = backgroundLocation ?? location;

  return (
    <>
      <AppShell>
        {/* Keyed by route so navigating away from a page that errored
            mounts a fresh boundary instead of staying stuck on the
            fallback. */}
        <ErrorBoundary key={pageLocation.pathname}>
          <Suspense fallback={<LoadingState />}>
            <Routes location={pageLocation}>
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
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      {backgroundLocation && (
        <Routes>
          <Route
            path="/calculator"
            element={
              <Suspense fallback={null}>
                <ProfitCalculatorModal isOpen onClose={() => navigate(-1)} />
              </Suspense>
            }
          />
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
