import { PanelCard } from "../../shared/components/PanelCard";
import type { KeywordData } from "./dashboardData";
import styles from "./KeywordCloud.module.css";

export function KeywordCloud({ keywords }: { keywords: KeywordData[] }) {
  return (
    <PanelCard padded>
      <div className={styles.cloud}>
        {keywords.map((kw) => (
          <div className={styles.pill} key={kw.id}>
            {kw.text} <span className={styles.up}>{kw.growth}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
