import { useEffect, useState } from "react";
import styles from "./ShopAvatar.module.css";

interface ShopAvatarProps {
  initials: string;
  /** Etsy's icon_url_fullxfull. Optional, and deliberately so: it is the
   *  full-resolution icon, which is fine for the single avatar on a shop's
   *  detail page but not for a table of up to 100 search results. Callers
   *  that render in bulk omit it and get the initials. */
  iconUrl?: string;
  small?: boolean;
}

export function ShopAvatar({ initials, iconUrl, small }: ShopAvatarProps) {
  const [failed, setFailed] = useState(false);

  // /shops/:shopId is a single route, so navigating from one shop to another
  // reuses this component instance. Without the reset, one shop's broken
  // icon would keep the next shop's working one from ever rendering.
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
