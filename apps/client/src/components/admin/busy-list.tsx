import {
  facetChoices,
  LIST_COPY,
  listAsk,
  listCount,
  listQueryFromParams,
  listQueryIsSet,
  listQueryToParams,
  type ListAsk,
  type ListFacet,
  type ListQuery,
  type ListWhen,
  type WhenPreset,
} from '@app/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { SearchXIcon, type LucideIcon } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListTable, type ListColumn } from '@/components/admin/list-table';
import { SmartSearch } from '@/components/admin/smart-search';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { ListFoot, nearEnd, type ListMore } from '@/components/list-foot';
import { ReadFailed, Reading } from '@/components/read-state';
import { useColumns } from '@/components/screen';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { SPACE } from '@/theme';

/** A page of a busy list, and whether there's another after it. */
export interface ListPage<T> {
  items: T[];
  more: boolean;
}

/** What a busy list reads, from its own corner of the database. */
export interface BusyListSource<T, C> {
  /** Its name in the cache; anything else its reads depend on (whose account "You" is) goes after it. */
  key: readonly unknown[];
  facets: readonly ListFacet[];
  defaultWhen?: WhenPreset;
  /** What the list calls When (Deletions: Asked), and whether a moment starts it. */
  when?: ListWhen;
  /** A page of rows after `cursor` (null for the first), narrowed as `ask` says. */
  rows: (cursor: C | null, ask: ListAsk) => Promise<ListPage<T>>;
  /** How many rows match `ask`. */
  count: (ask: ListAsk) => Promise<number>;
  /** Where the next page starts: the last row's cursor. */
  cursor: (last: T) => C;
}

/**
 * Every admin list's reading, shared: the query from the page's address,
 * the window When makes from the moment it was asked, the rows 50 at a time
 * as you scroll, the count of what matches, and a way to ask again. A page
 * says only where its rows come from; BusyList draws them.
 */
export function useBusyList<T, C>(source: BusyListSource<T, C>) {
  const params = useLocalSearchParams();
  const defaultWhen = source.defaultWhen ?? 'any';
  const query = listQueryFromParams(params, facetChoices(source.facets), defaultWhen);
  const shown = listQueryToParams(query, defaultWhen);
  const key = JSON.stringify(shown);
  // The last hour is the hour before you asked, however long you scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new question, a new moment
  const asked = useMemo(() => new Date(), [key]);
  const ask = listAsk(query, asked, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const list = useInfiniteQuery({
    queryKey: [...source.key, 'rows', key],
    queryFn: ({ pageParam }) => source.rows(pageParam as C | null, ask),
    initialPageParam: null as C | null,
    getNextPageParam: (last: ListPage<T>) => (last.more && last.items.length > 0 ? source.cursor(last.items[last.items.length - 1]) : null),
    // While a new search reads, the last one's rows stay, so the list doesn't blink as you type.
    placeholderData: keepPreviousData,
  });
  const count = useQuery({ queryKey: [...source.key, 'count', key], queryFn: () => source.count(ask), placeholderData: keepPreviousData });
  const more: ListMore = {
    has: list.hasNextPage,
    busy: list.isFetchingNextPage,
    failed: list.isFetchNextPageError,
    load: () => void list.fetchNextPage(),
  };
  const names = ['q', ...source.facets.map((facet) => facet.key), 'when', 'from'];
  /** Asks again by address (Show more like this): what's set goes in it, and nothing for what isn't. */
  const show = (set: Record<string, string>) => router.setParams(Object.fromEntries(names.map((name) => [name, set[name]])));
  const setQuery = (next: ListQuery) => show(listQueryToParams(next, defaultWhen));
  return {
    query,
    setQuery,
    show,
    defaultWhen,
    facets: source.facets,
    when: source.when ?? {},
    list,
    items: list.data?.pages.flatMap((page) => page.items) ?? [],
    count: count.data ?? null,
    more,
    narrowed: listQueryIsSet(query, defaultWhen),
    /** The Screen's onNearEnd, once the first page is in. */
    onNearEnd: list.data ? nearEnd(more) : undefined,
  };
}

export type BusyList<T> = ReturnType<typeof useBusyList<T, unknown>>;

/**
 * Every admin list, drawn the same way: the one search box, the count of
 * what matches with Clear, then the rows (a table on a laptop, Rows on a
 * phone), and the foot every long list has. Nothing matching says so, with
 * Clear; an empty list says what will fill it.
 */
export function BusyListView<T>({
  busy,
  name,
  placeholder,
  noun,
  columns,
  tableRow,
  row,
  empty,
  foot,
}: {
  busy: BusyList<T>;
  /** The list's name in test ids and its recent searches: "audit". */
  name: string;
  placeholder: string;
  /** "2,481 entries". */
  noun: (count: string) => string;
  columns: readonly ListColumn[];
  tableRow: (item: T) => ReactNode;
  row: (item: T) => ReactNode;
  empty: { icon: LucideIcon; title: string; body: string };
  /** What the foot says is shown, when the count isn't in yet: how far back. */
  foot?: (last: T) => string;
}) {
  const wide = useColumns();
  const head = (
    <>
      <SmartSearch
        query={busy.query}
        facets={busy.facets}
        onChange={busy.setQuery}
        placeholder={placeholder}
        recentKey={`admin-recent-${name}`}
        defaultWhen={busy.defaultWhen}
        when={busy.when}
        testID={`${name}-search`}
      />
      <View style={styles.count} testID={`${name}-count`}>
        <Meta>{busy.count === null ? ' ' : noun(listCount(busy.count, false))}</Meta>
        {busy.narrowed ? <TextButton label={LIST_COPY.clear} onPress={() => busy.show({})} testID={`${name}-clear`} /> : null}
      </View>
    </>
  );

  let body: ReactNode;
  if (busy.list.isPending) body = <Reading />;
  else if (busy.list.isError) body = <ReadFailed onRetry={() => void busy.list.refetch()} />;
  else if (busy.items.length === 0)
    body = busy.narrowed ? (
      <EmptyState icon={SearchXIcon} title={LIST_COPY.noMatch} body={LIST_COPY.noMatchBody} testID={`${name}-no-match`} />
    ) : (
      <EmptyState icon={empty.icon} title={empty.title} body={empty.body} testID={`${name}-empty`} />
    );
  else {
    const last = busy.items[busy.items.length - 1];
    body = (
      <>
        {wide ? (
          <ListTable columns={columns} testID={`${name}-table`}>
            {busy.items.map(tableRow)}
          </ListTable>
        ) : (
          <Group testID={`${name}-rows`}>{busy.items.map(row)}</Group>
        )}
        <ListFoot
          more={busy.more}
          shown={busy.count !== null ? LIST_COPY.of(busy.items.length, busy.count) : (foot?.(last) ?? null)}
          testID={`${name}-foot`}
        />
      </>
    );
  }
  return (
    <View style={styles.list}>
      {head}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  count: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md, minHeight: 32 },
});
