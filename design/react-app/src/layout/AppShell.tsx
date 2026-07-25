import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
}

/** Composes sidebar + topbar + content area. Both Sidebar and Topbar
 *  read navigation state (what page is active) from the router
 *  themselves — the one thing this level still owns is whether the
 *  sidebar drawer is open, since that's UI state shared between two
 *  siblings (Topbar's hamburger opens it, Sidebar renders it), not
 *  routing state either of them can derive on its own. */
export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Closing on every navigation means a nav click on mobile always
  // dismisses the drawer, without Sidebar needing to know it's on
  // mobile or call back into anything beyond "navigate".
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={styles.app}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={styles.main}>
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
