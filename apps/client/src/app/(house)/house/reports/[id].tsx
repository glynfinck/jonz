import { REPORT_COPY, reportGist } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MessagesSquareIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { myReport, seeReport, writeBack, type Report } from '@/api/reports';
import { EmptyState } from '@/components/empty-state';
import { HousePage } from '@/components/house/house-page';
import { ReplyBox, ReportChip, ReportThread, said } from '@/components/report/report-parts';
import { Lead, Meta } from '@/components/text';
import { SECTION_GAP, SPACE } from '@/theme';

/** One of your reports: what it's about and where it's got to, the conversation, and a box to write back. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const report = useQuery({ queryKey: ['my-report', id], queryFn: () => myReport(id) });
  // Reading it here reads its replies: House stops counting them.
  const seen = report.data?.id;
  useEffect(() => {
    if (!seen) return;
    void seeReport(seen).then(() => client.invalidateQueries({ queryKey: ['my-reports'] }));
  }, [client, seen]);
  const send = async (text: string) => {
    await writeBack(id, text);
    await Promise.all([report.refetch(), client.invalidateQueries({ queryKey: ['my-reports'] })]);
  };
  return (
    <HousePage
      title={REPORT_COPY.yourReport}
      back="/house/reports"
      backLabel={REPORT_COPY.yours}
      testID="your-report"
      ready={report.data !== undefined}
      failed={report.isError}
      onRetry={() => void report.refetch()}
    >
      {() => <YourReport report={report.data!} onSend={send} />}
    </HousePage>
  );
}

function YourReport({ report, onSend }: { report: Report | null; onSend: (text: string) => Promise<void> }) {
  if (!report) return <EmptyState icon={MessagesSquareIcon} title={REPORT_COPY.missing} body={REPORT_COPY.missingBody} />;
  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <View style={styles.titleLine}>
          <Lead header style={styles.title}>
            {reportGist(report.words)}
          </Lead>
          <ReportChip state={report.state} testID="your-report-state" />
        </View>
        <Meta>{REPORT_COPY.sentAt(report.kind, said(report.sentAt))}</Meta>
      </View>
      <ReportThread report={report} viewer="them" />
      <ReplyBox placeholder={REPORT_COPY.writeBack} onSend={onSend} testID="write-back" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SECTION_GAP },
  head: { gap: SPACE.xs },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  title: { flex: 1 },
});
