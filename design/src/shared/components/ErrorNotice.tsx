import { AlertCircleIcon } from "../icons";
import styles from "./ErrorNotice.module.css";

interface ErrorNoticeProps {
  /** Message from describeError() — the API's own wording where there is
   *  one (a missing Etsy key, a rate limit, an unknown route), not a
   *  generic "something went wrong". */
  message: string;
  /** Shown as a retry button when the caller can re-run the failed call. */
  onRetry?: () => void;
}

/** Page-level failure banner. Until this existed, a failed repository call
 *  only reached console.error, so the UI silently rendered "0 results" for
 *  everything from a wrong API key to a stale Flask process. */
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
