import styles from "./TodoBadge.module.css";

const REPO = "https://github.com/IT-mozg/PODStudio/issues";

interface TodoBadgeProps {
  /** GitHub issue number that will make this block real. */
  issue: number;
  /** Why the data isn't there — shown on hover, and it should say what's
   *  missing, not just "todo". */
  reason: string;
}

/** Marks a block whose data Etsy's API doesn't provide (yet).
 *
 *  The point is honesty: before #78 this page rendered PRNG output —
 *  a Listing Score, a keyword volume, a conversion rate — indistinguishable
 *  from real analytics. Anything without a real source now carries one of
 *  these instead of a plausible number. */
export function TodoBadge({ issue, reason }: TodoBadgeProps) {
  return (
    <a
      className={styles.badge}
      href={`${REPO}/${issue}`}
      target="_blank"
      rel="noreferrer"
      title={reason}
    >
      TODO #{issue}
    </a>
  );
}
