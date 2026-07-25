import { SearchIcon } from "../icons";
import styles from "./SearchToolbar.module.css";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitLabel?: string;
}

export function SearchBar({ value, onChange, onSubmit, placeholder, submitLabel = "Аналізувати" }: SearchBarProps) {
  return (
    <div className={styles.searchHero}>
      <div className={styles.searchInput}>
        <SearchIcon size={17} />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
      </div>
      <button className={styles.searchBtn} onClick={onSubmit}>
        {submitLabel}
      </button>
    </div>
  );
}
