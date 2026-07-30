import { AlertCircleIcon } from "../icons";
import styles from "./ErrorNotice.module.css";

interface ErrorNoticeProps {
  /** From describeError() — the API's own wording, not "something went wrong". */
  message: string;
  onRetry?: () => void;
}

/** Page-level failure banner. Without it a failed call only reached
 *  console.error, and the UI rendered "0 results" for everything from a wrong
 *  API key to a stale Flask process. */
export function ErrorNotice({ message, onRetry }: ErrorNoticeProps) {
  return (
    <div className={styles.notice} role="alert">
      <div className={styles.icon}>
        <AlertCircleIcon size={20} />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>Запит не виконався</div>
        <div className={styles.message}>{message}</div>
      </div>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Спробувати ще
        </button>
      )}
    </div>
  );
}
