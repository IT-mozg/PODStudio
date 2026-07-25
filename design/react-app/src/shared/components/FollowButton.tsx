import { StarIcon } from "../icons";
import styles from "./FollowButton.module.css";

interface FollowButtonProps {
  tracked: boolean;
  onClick: () => void;
}

/** "Відстежувати" / "У відстежуваних" pill on a detail page header —
 *  same button on Магазин and Лістинг detail, one place to change it. */
export function FollowButton({ tracked, onClick }: FollowButtonProps) {
  return (
    <div className={tracked ? `${styles.btn} ${styles.active}` : styles.btn} onClick={onClick}>
      <StarIcon size={14} />
      {tracked ? "У відстежуваних" : "Відстежувати"}
    </div>
  );
}
