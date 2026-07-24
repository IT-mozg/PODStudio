import styles from "./ShopAvatar.module.css";

interface ShopAvatarProps {
  initials: string;
  small?: boolean;
}

export function ShopAvatar({ initials, small }: ShopAvatarProps) {
  return <div className={small ? `${styles.avatar} ${styles.small}` : styles.avatar}>{initials}</div>;
}
