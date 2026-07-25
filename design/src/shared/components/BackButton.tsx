import { ArrowLeftIcon } from "../icons";
import styles from "./BackButton.module.css";

interface BackButtonProps {
  onClick: () => void;
}

/** Circular "back to the list" button — same shape on every detail
 *  page (Магазин, Лістинг, ...) instead of each one inventing its own
 *  back-navigation treatment. */
export function BackButton({ onClick }: BackButtonProps) {
  return (
    <div className={styles.backBtn} onClick={onClick} title="Назад до списку">
      <ArrowLeftIcon size={16} />
    </div>
  );
}
