import { SearchBar } from "../../shared/components/SearchBar";
import { FilterChips } from "../../shared/components/FilterChips";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import { LISTING_FILTERS } from "./listingFilters";
import { ListingsTable } from "./ListingsTable";
import type { Listing, ListingFilter } from "./types";

interface ListingsSearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder: string;
  filter: ListingFilter;
  onFilterChange: (filter: ListingFilter) => void;
  resultsLabel: string;
  resultsValue: string;
  listings: Listing[];
  onToggleTracked: (listingId: string) => void;
  onSelectListing: (listing: Listing) => void;
  onSelectShop: (shopId: string) => void;
}

/** Search + filter chips + results count + table — the exact block
 *  Лістинги's own search tab and a shop's "Лістинги" tab both need.
 *  Each caller still owns how `listings` gets produced (a repository
 *  round-trip vs. filtering an already-loaded array) since that part
 *  genuinely differs; this only dedupes the UI wiring around it. */
export function ListingsSearchPanel({
  query,
  onQueryChange,
  onSearchSubmit,
  searchPlaceholder,
  filter,
  onFilterChange,
  resultsLabel,
  resultsValue,
  listings,
  onToggleTracked,
  onSelectListing,
  onSelectShop,
}: ListingsSearchPanelProps) {
  return (
    <>
      <SearchBar value={query} onChange={onQueryChange} onSubmit={onSearchSubmit ?? (() => {})} placeholder={searchPlaceholder} />
      <FilterChips options={LISTING_FILTERS} active={filter} onSelect={onFilterChange} />

      <ResultsToolbar label={resultsLabel} value={resultsValue} />
      <div className={searchStyles.tableWrap}>
        <ListingsTable listings={listings} onToggleTracked={onToggleTracked} onSelectListing={onSelectListing} onSelectShop={onSelectShop} />
      </div>
    </>
  );
}
