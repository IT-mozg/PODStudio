import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
}

/** Composes sidebar + topbar + content area. Both Sidebar and Topbar
 *  now read navigation state from the router themselves, so this
 *  component has nothing left to pass them — it's pure layout. */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.app}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
