import { PanelCard } from "../../shared/components/PanelCard";
import type { KeywordData } from "./dashboardData";
import styles from "./KeywordCloud.module.css";

interface KeywordCloudProps {
  keywords: KeywordData[];
  onSelect: (text: string) => void;
}

export function KeywordCloud({ keywords, onSelect }: KeywordCloudProps) {
  return (
    <PanelCard padded>
      <div className={styles.cloud}>
        {keywords.map((kw) => (
          <div className={styles.pill} key={kw.id} onClick={() => onSelect(kw.text)}>
            {kw.text} <span className={styles.up}>{kw.growth}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
