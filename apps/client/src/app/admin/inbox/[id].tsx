import { REPORT_COPY } from '@app/core';
import { useLocalSearchParams } from 'expo-router';

import { ReportPanel } from '@/components/report/report-panel';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';

/** One report on a phone: the Inbox's side panel as a page of its own. */
export default function InboxReportPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen bar={<TitleBar title={REPORT_COPY.inbox} back="/admin/inbox" backLabel={REPORT_COPY.inbox} />} testID="admin-inbox-report">
      <ReportPanel id={id} />
    </Screen>
  );
}
