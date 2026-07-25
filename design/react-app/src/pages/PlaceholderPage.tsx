import { AssetsIcon } from "../shared/icons";
import styles from "./PlaceholderPage.module.css";

export function PlaceholderPage({ pageLabel }: { pageLabel: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={styles.icon}>
          <AssetsIcon size={28} />
        </div>
        <h1>Заглушка вмісту сторінки: {pageLabel}</h1>
        <p>Цю сторінку ще не перенесено на React — реальний вміст додамо на наступних кроках.</p>
        <div className={styles.tag}>design/react-app · крок 3</div>
      </div>
    </div>
  );
}
