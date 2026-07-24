import type { ReactNode } from "react";
import type { PageId, SidebarMode } from "../shared/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  mode: SidebarMode;
  activePage: PageId;
  currentPageLabel: string;
  onModeChange: (mode: SidebarMode) => void;
  onSelectPage: (page: PageId) => void;
  children: ReactNode;
}

/** Composes sidebar + topbar + content area. Knows nothing about what
 *  a page renders (that's `children`) — only about page chrome. */
export function AppShell({ mode, activePage, currentPageLabel, onModeChange, onSelectPage, children }: AppShellProps) {
  return (
    <div className={styles.app}>
      <Sidebar mode={mode} activePage={activePage} onModeChange={onModeChange} onSelectPage={onSelectPage} />
      <div className={styles.main}>
        <Topbar currentPageLabel={currentPageLabel} />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
