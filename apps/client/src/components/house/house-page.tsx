import { SECTION_LABEL } from '@app/core';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

import { PageTitle } from '@/components/page-title';
import { Reading, ReadFailed } from '@/components/read-state';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';

/**
 * A page House pushes (the John list, the rules, time away, groups, a
 * housemate): its title bar with the way back, the browser tab's title,
 * and its first read. `children` is called once `ready`, so it can use
 * what was read without checking again.
 */
export function HousePage({
  title,
  testID,
  ready,
  failed,
  onRetry,
  refreshing,
  onRefresh,
  back = '/house',
  backLabel = SECTION_LABEL.house,
  fills = false,
  children,
}: {
  title: string;
  testID: string;
  ready: boolean;
  failed: boolean;
  onRetry: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  back?: Href;
  /** Where `back` goes, in words: House unless it says otherwise. */
  backLabel?: string;
  /** On a laptop the page fills the room beside House's list, its sections in columns (Pair, Flow). */
  fills?: boolean;
  children: () => ReactNode;
}) {
  return (
    <Screen
      bar={<TitleBar title={title} back={back} backLabel={backLabel} />}
      fills={fills}
      refreshing={refreshing}
      onRefresh={onRefresh}
      testID={testID}
    >
      <PageTitle page={title} />
      {ready ? children() : failed ? <ReadFailed onRetry={onRetry} /> : <Reading />}
    </Screen>
  );
}
