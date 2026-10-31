import {
  ADMIN_COPY,
  AUDIT_DROPDOWNS,
  AUDIT_LIST_COPY,
  LIST_COPY,
  listCount,
  listQueryFromParams,
  listQueryIsSet,
  listQueryToParams,
  listTime,
  listWindow,
  type AuditEntry,
  type AuditWhat,
  type AuditWho,
  type ListQuery,
} from '@app/core';
import { useInfiniteQuery, useQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollTextIcon, SearchXIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { auditCount, auditPage, type AuditFilter } from '@/api/owner';
import { AUDIT_TABLE, AuditDetail, AuditRow, AuditTableRow, ownerZone } from '@/components/admin/audit-entry';
import { ListTable } from '@/components/admin/list-table';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { ListFoot, nearEnd, type ListMore } from '@/components/list-foot';
import { ReadFailed, Reading } from '@/components/read-state';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { useMembership } from '@/hooks/use-membership';
import { useNow } from '@/hooks/use-now';
import { SPACE } from '@/theme';

/** Everything the page's address can say about the list. */
const PARAMS = ['q', ...Object.keys(AUDIT_DROPDOWNS), 'when', 'from'] as const;

/**
 * The audit log, built for thousands of entries a day: no day headings, one
 * row an entry with its time (and its date, before today), newest first.
 * What's searched and filtered lives in the page's address and the database
 * does the narrowing, 50 rows at a time as you scroll, with a count of what
 * matches over the list. On a laptop the rows are a table and the entry
 * chosen sits in the side panel; on a phone they are rows and an entry
 * opens as its own page. Show more like this, on an entry, narrows the list
 * to more of the same.
 */
export default function AuditPage() {
  const params = useLocalSearchParams();
  const query = listQueryFromParams(params, AUDIT_DROPDOWNS);
  const key = JSON.stringify(listQueryToParams(query));
  const ownerId = useMembership().session?.user.id ?? null;
  // When was asked: The last hour means the hour before you asked, however long you scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new question, a new moment
  const asked = useMemo(() => new Date(), [key]);
  const filter: AuditFilter = {
    q: query.q,
    who: (query.picks.who ?? 'anyone') as AuditWho,
    what: (query.picks.what ?? 'anything') as AuditWhat,
    ownerId,
    ...listWindow(query, asked, ownerZone()),
  };
  const log = useInfiniteQuery({
    queryKey: ['owner-audit', 'rows', key, ownerId],
    queryFn: ({ pageParam }) => auditPage(pageParam, filter),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.more ? (last.entries[last.entries.length - 1]?.id ?? null) : null),
  });
  const count = useQuery({ queryKey: ['owner-audit', 'count', key, ownerId], queryFn: () => auditCount(filter) });
  const more: ListMore = {
    has: log.hasNextPage,
    busy: log.isFetchingNextPage,
    failed: log.isFetchNextPageError,
    load: () => void log.fetchNextPage(),
  };
  return (
    <Screen spreads bar={<TitleBar title="Audit log" />} onNearEnd={log.data ? nearEnd(more) : undefined} testID="admin-audit">
      <AuditLog log={log} more={more} count={count.data ?? null} query={query} ownerId={ownerId} />
    </Screen>
  );
}

/** Puts a query in the page's address: what's set, and nothing for what isn't. */
function ask(next: Record<string, string>) {
  router.setParams(Object.fromEntries(PARAMS.map((name) => [name, next[name]])));
}

type Log = UseInfiniteQueryResult<InfiniteData<Awaited<ReturnType<typeof auditPage>>>>;

function AuditLog({
  log,
  more,
  count,
  query,
  ownerId,
}: {
  log: Log;
  more: ListMore;
  count: number | null;
  query: ListQuery;
  ownerId: string | null;
}) {
  const two = useColumns();
  const now = useNow();
  const [chosen, setChosen] = useState<number | null>(null);
  if (log.isPending) return <Reading />;
  if (log.isError) return <ReadFailed onRetry={() => void log.refetch()} />;

  const narrowed = listQueryIsSet(query);
  const entries: AuditEntry[] = log.data.pages.flatMap((page) => page.entries);
  const head = <CountLine count={count} narrowed={narrowed} />;
  if (entries.length === 0) {
    return (
      <>
        {head}
        {narrowed ? (
          <EmptyState icon={SearchXIcon} title={AUDIT_LIST_COPY.noMatch} body={AUDIT_LIST_COPY.noMatchBody} testID="audit-no-match" />
        ) : (
          <EmptyState icon={ScrollTextIcon} title={ADMIN_COPY.noAudit} body={ADMIN_COPY.noAuditBody} testID="audit-empty" />
        )}
      </>
    );
  }
  const shown = entries.find((entry) => entry.id === chosen) ?? entries[0];
  const open = (entry: AuditEntry) => (two ? setChosen(entry.id) : router.push(`/admin/audit/${entry.id}` as never));
  const last = entries[entries.length - 1];
  const foot = (
    <ListFoot
      more={more}
      shown={count !== null ? LIST_COPY.of(entries.length, count) : LIST_COPY.backTo(listTime(last.at, now, ownerZone(), false))}
      testID="audit-foot"
    />
  );

  const list = two ? (
    <View style={styles.list}>
      {head}
      <ListTable columns={AUDIT_TABLE} testID="audit-table">
        {entries.map((entry) => (
          <AuditTableRow
            key={entry.id}
            entry={entry}
            ownerId={ownerId}
            now={now}
            chosen={entry.id === shown.id}
            onPress={() => open(entry)}
          />
        ))}
      </ListTable>
      {foot}
    </View>
  ) : (
    <View style={styles.list}>
      {head}
      <Group testID="audit-rows">
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} ownerId={ownerId} now={now} onPress={() => open(entry)} />
        ))}
      </Group>
      {foot}
    </View>
  );
  return two ? (
    <Columns
      main={list}
      side={
        <AuditDetail
          entry={shown}
          ownerId={ownerId}
          onLikeThis={(like) => {
            setChosen(null);
            ask(like);
          }}
        />
      }
    />
  ) : (
    list
  );
}

/** How many entries match, over the list, with Clear when anything narrows it. */
function CountLine({ count, narrowed }: { count: number | null; narrowed: boolean }) {
  return (
    <View style={styles.count} testID="audit-count">
      <Meta>{count === null ? ' ' : AUDIT_LIST_COPY.count(listCount(count, false))}</Meta>
      {narrowed ? <TextButton label={AUDIT_LIST_COPY.clear} onPress={() => ask({})} testID="audit-clear" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  count: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md, minHeight: 32 },
});
