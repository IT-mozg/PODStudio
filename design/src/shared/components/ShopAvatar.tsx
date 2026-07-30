import { useEffect, useState } from "react";
import styles from "./ShopAvatar.module.css";

interface ShopAvatarProps {
  initials: string;
  /** Etsy's icon_url_fullxfull — full resolution, so callers rendering in
   *  bulk omit it and get the initials instead. */
  iconUrl?: string;
  small?: boolean;
}

export function ShopAvatar({ initials, iconUrl, small }: ShopAvatarProps) {
  const [failed, setFailed] = useState(false);

  // One route for all shops means this instance is reused across them —
  // without the reset, one broken icon hides the next shop's working one.
  useEffect(() => setFailed(false), [iconUrl]);

  const className = small ? `${styles.avatar} ${styles.small}` : styles.avatar;
  if (iconUrl && !failed) {
    return (
      <div className={className}>
        <img className={styles.img} src={iconUrl} alt="" onError={() => setFailed(true)} />
      </div>
    );
  }
  return <div className={className}>{initials}</div>;
}
