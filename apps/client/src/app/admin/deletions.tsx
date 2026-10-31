import {
  ADMIN_COPY,
  daysUntil,
  DELETION_FACETS,
  DELETION_LIST_COPY,
  DELETION_WHEN,
  deletionDay,
  FOCUS_SHELL_COPY,
  listTime,
  type PendingDeletion,
} from '@app/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailIcon, UserXIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deleteByEmail, deleteNow, deletionFilter, deletionsCount, deletionsPage, stopDeletion, type DeletionCursor } from '@/api/owner';
import { ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { useNow } from '@/hooks/use-now';
import { SPACE, TABULAR, useTheme } from '@/theme';

const KEY = ['owner-deletions'];

/** Deletions' columns on a laptop. */
const DELETION_TABLE: readonly ListColumn[] = [
  { key: 'name', label: DELETION_LIST_COPY.name, width: 150 },
  { key: 'email', label: DELETION_LIST_COPY.email, flex: 1 },
  { key: 'house', label: DELETION_LIST_COPY.house, width: 150 },
  { key: 'started', label: DELETION_LIST_COPY.started, width: 104 },
  { key: 'asked', label: DELETION_LIST_COPY.asked, width: 144 },
  { key: 'goes', label: DELETION_LIST_COPY.goes, width: 160, end: true },
];

/**
 * Everyone waiting to be deleted, soonest first, as busy as the list gets:
 * the one search box finds a name, email, house or account id, and filters
 * by who started it, how soon it goes and when they asked; the database
 * does the narrowing, 50 at a time as you scroll. Tapping one opens what can
 * be done: Delete now, when they've asked for it sooner, or Stop, when
 * they've changed their mind by email; each with a reason for the audit
 * log. Over the list, starting the 30 days for someone who emailed and
 * can't sign in. Every move writes the audit log, in the database.
 */
export default function DeletionsPage() {
  const busy = useBusyList({
    key: KEY,
    facets: DELETION_FACETS,
    when: DELETION_WHEN,
    rows: (cursor: DeletionCursor | null, ask) =>
      deletionsPage(cursor, deletionFilter(ask)).then((page) => ({ items: page.people, more: page.more })),
    count: (ask) => deletionsCount(deletionFilter(ask)),
    cursor: (person: PendingDeletion) => ({ at: person.deleteAfter, userId: person.userId }),
  });
  return (
    <Screen spreads bar={<TitleBar title="Deletions" />} onNearEnd={busy.onNearEnd} testID="admin-deletions">
      <Deletions busy={busy} />
    </Screen>
  );
}

function Deletions({ busy }: { busy: BusyList<PendingDeletion> }) {
  const now = useNow();
  const [chosen, setChosen] = useState<PendingDeletion | null>(null);
  const [byEmail, setByEmail] = useState(false);
  const started = (person: PendingDeletion) => (person.requestedBy === 'owner' ? DELETION_LIST_COPY.byYou : DELETION_LIST_COPY.inTheApp);
  return (
    <>
      <Group>
        <Row leading={<RowIcon icon={MailIcon} />} title={ADMIN_COPY.byEmail} onPress={() => setByEmail(true)} chevron testID="delete-by-email" />
      </Group>
      <BusyListView
        busy={busy}
        name="deletions"
        placeholder={DELETION_LIST_COPY.searchPlaceholder}
        noun={DELETION_LIST_COPY.count}
        columns={DELETION_TABLE}
        tableRow={(person) => {
          const cells = {
            name: person.name,
            email: person.email ?? '–',
            house: person.house ?? DELETION_LIST_COPY.noHouse,
            started: started(person),
            asked: listTime(person.requestedAt, now, ownerZone(), false),
            goes: ADMIN_COPY.goesIn(daysUntil(person.deleteAfter, now)),
          };
          return (
            <ListTableRow
              key={person.userId}
              columns={DELETION_TABLE}
              cells={cells}
              quiet={['email', 'house', 'started', 'asked']}
              strong={['name']}
              onPress={() => setChosen(person)}
              accessibilityLabel={Object.values(cells).join(', ')}
              testID={`deletion-${person.userId}`}
            />
          );
        }}
        row={(person) => (
          <Row
            key={person.userId}
            leading={<Avatar name={person.name} userId={person.userId} />}
            title={person.name}
            // The email on a line of its own, so a long one is cut at its end rather than broken in two.
            meta={[
              person.email,
              `${person.house ?? ADMIN_COPY.noHouse}, ${person.requestedBy === 'owner' ? ADMIN_COPY.startedByYou : ADMIN_COPY.askedInApp}`,
            ]
              .filter(Boolean)
              .join('\n')}
            metaLines={2}
            trailing={<Left iso={person.deleteAfter} now={now} />}
            onPress={() => setChosen(person)}
            chevron
            testID={`deletion-${person.userId}`}
          />
        )}
        empty={{ icon: UserXIcon, title: ADMIN_COPY.noDeletions, body: ADMIN_COPY.noDeletionsBody }}
      />

      <ChosenSheet key={chosen?.userId ?? 'none'} person={chosen} onClose={() => setChosen(null)} />
      <ByEmailSheet visible={byEmail} onClose={() => setByEmail(false)} />
    </>
  );
}

/** How long is left, at the row's end. */
function Left({ iso, now }: { iso: string; now: Date }) {
  const { type, colors } = useTheme();
  return <Text style={[type.meta, TABULAR, { color: colors.mutedForeground }]}>{ADMIN_COPY.goesIn(daysUntil(iso, now))}</Text>;
}

/** What can be done to one person's deletion: Delete now or Stop, and why. */
function ChosenSheet({ person, onClose }: { person: PendingDeletion | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<'now' | 'stop' | null>(null);
  const done = (message: string) => {
    toast.show(message);
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ['owner-audit'] });
    onClose();
  };
  const now = useMutation({
    mutationFn: (userId: string) => deleteNow(userId, reason),
    onSuccess: () => done(ADMIN_COPY.deletingSoon),
  });
  const stop = useMutation({
    mutationFn: (userId: string) => stopDeletion(userId, reason),
    onSuccess: () => done(ADMIN_COPY.stopped),
  });
  const busy = now.isPending || stop.isPending;
  const problem = now.error?.message ?? stop.error?.message ?? null;
  if (!person) return null;

  const title =
    asking === 'now' ? ADMIN_COPY.deleteNowAsk(person.name) : asking === 'stop' ? ADMIN_COPY.stopAsk(person.name) : person.name;
  const description =
    asking === 'now'
      ? ADMIN_COPY.deleteNowBody
      : asking === 'stop'
        ? ADMIN_COPY.stopBody
        : `${person.email ?? ''}${person.email ? ', ' : ''}${ADMIN_COPY.goesIn(daysUntil(person.deleteAfter, new Date())).toLowerCase()} (${deletionDay(person.deleteAfter)})`;
  return (
    <Sheet visible title={title} description={description} onClose={onClose} testID="deletion-sheet">
      <Field
        label={ADMIN_COPY.reason}
        value={reason}
        onChangeText={setReason}
        placeholder={ADMIN_COPY.reasonPlaceholder}
        maxLength={500}
        testID="deletion-reason"
      />
      {problem ? <Alert message={problem} /> : null}
      <View style={styles.buttons}>
        {asking === null ? (
          <>
            <Button variant="hazard" label={ADMIN_COPY.deleteNow} onPress={() => setAsking('now')} testID="deletion-now" />
            <Button variant="outline" label={ADMIN_COPY.stop} onPress={() => setAsking('stop')} testID="deletion-stop" />
          </>
        ) : (
          <>
            <Button
              variant={asking === 'now' ? 'hazard' : 'primary'}
              label={asking === 'now' ? ADMIN_COPY.deleteNow : ADMIN_COPY.stop}
              disabled={busy}
              onPress={() => (asking === 'now' ? now : stop).mutate(person.userId)}
              testID="deletion-confirm"
            />
            <Button variant="outline" label={FOCUS_SHELL_COPY.cancel} disabled={busy} onPress={() => setAsking(null)} testID="deletion-cancel" />
          </>
        )}
      </View>
    </Sheet>
  );
}

/** Start the 30 days for someone who emailed and can't sign in. */
function ByEmailSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const start = useMutation({
    mutationFn: () => deleteByEmail(email, reason),
    onSuccess: () => {
      toast.show(ADMIN_COPY.started);
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['owner-audit'] });
      setEmail('');
      setReason('');
      onClose();
    },
  });
  return (
    <Sheet visible={visible} title={ADMIN_COPY.byEmail} description={ADMIN_COPY.byEmailBody} onClose={onClose} testID="by-email-sheet">
      <Field
        label={ADMIN_COPY.email}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="deletion-email"
      />
      <Field
        label={ADMIN_COPY.reason}
        value={reason}
        onChangeText={setReason}
        placeholder={ADMIN_COPY.reasonPlaceholder}
        maxLength={500}
        testID="deletion-email-reason"
      />
      {start.error ? <Alert message={start.error.message} /> : null}
      <Button
        label={ADMIN_COPY.startDeleting}
        disabled={!email.includes('@') || start.isPending}
        onPress={() => start.mutate()}
        testID="deletion-start"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: SPACE.sm },
});
