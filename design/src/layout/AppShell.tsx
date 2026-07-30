import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
}

/** Sidebar and Topbar each read navigation state from the router, so all
 *  this level owns is whether the drawer is open — the one piece of state
 *  genuinely shared between the two. */
export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // So a nav click dismisses the drawer without Sidebar knowing it's on
  // mobile or calling back into anything beyond "navigate".
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
