import { AlertCircleIcon, ImageIcon, MonitorIcon } from "../../shared/icons";
import type { QueueItemData } from "./dashboardData";
import styles from "./QueueCard.module.css";

const iconByKind = {
  image: ImageIcon,
  monitor: MonitorIcon,
  alert: AlertCircleIcon,
};

function QueueCard({ item }: { item: QueueItemData }) {
  const Icon = iconByKind[item.kind];
  return (
    <div className={styles.card}>
      <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${item.gradient[0]}, ${item.gradient[1]})` }}>
        <span className={styles.tag}>{item.tag}</span>
        <Icon size={26} />
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{item.name}</div>
        <div className={styles.meta}>{item.meta}</div>
      </div>
    </div>
  );
}

export function QueueGrid({ items }: { items: QueueItemData[] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <QueueCard item={item} key={item.id} />
      ))}
    </div>
  );
}
