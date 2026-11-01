import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { COLUMN_MIN, CONTENT_MAX, FILL_MAX, SECTION_GAP } from '@/theme';

import { columnsIn, Flow, flowColumns, Pair } from './page-columns';
import { Screen } from './screen';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));

const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const kinds = ['Kitchen', 'Bathroom', 'Floors', 'Bins', 'Errands'].map((name, i) => ({
  key: name,
  weight: [3, 2, 3, 4, 2][i],
  node: <Text>{name}</Text>,
}));

function page({ fills = true }: { fills?: boolean } = {}) {
  return (
    <Screen fills={fills}>
      <Flow items={kinds} testID="kinds" />
      <Pair start={<Text>Includes</Text>} end={<Text>Plans</Text>} testID="pair" />
    </Screen>
  );
}

/** The scrolling page's content, as one style. */
function content() {
  return StyleSheet.flatten(screen.getByTestId('page-scroll').props.contentContainerStyle);
}

it('fits columns of at least COLUMN_MIN, SECTION_GAP apart', () => {
  expect(columnsIn(COLUMN_MIN - 1)).toBe(1);
  expect(columnsIn(2 * COLUMN_MIN + SECTION_GAP - 1)).toBe(1);
  expect(columnsIn(2 * COLUMN_MIN + SECTION_GAP)).toBe(2);
  // A 1440 laptop beside the rail and House's list, and a 1920 screen.
  expect(columnsIn(1440 - 232 - 240 - 32)).toBe(2);
  expect(columnsIn(1920 - 232 - 240 - 32)).toBe(3);
});

it('shares things out in order, each to the shortest column so far, the leftmost of a tie', () => {
  expect(flowColumns([3, 2, 3, 4, 2], 2)).toEqual([
    [0, 3],
    [1, 2, 4],
  ]);
  expect(flowColumns([1, 1, 1], 3)).toEqual([[0], [1], [2]]);
  expect(flowColumns([5], 3)).toEqual([[0], [], []]);
  expect(flowColumns([2, 2], 0)).toEqual([[0, 1]]);
});

it('keeps one column on a phone, in order', async () => {
  await render(page());
  expect(content()).toMatchObject({ maxWidth: CONTENT_MAX });
  expect(screen.queryAllByTestId('kinds-column')).toHaveLength(0);
  expect(screen.queryByTestId('pair-start')).toBeNull();
  expect(screen.getAllByText(/^(Kitchen|Bathroom|Floors|Bins|Errands|Includes|Plans)$/).map((t) => t.props.children)).toEqual([
    'Kitchen',
    'Bathroom',
    'Floors',
    'Bins',
    'Errands',
    'Includes',
    'Plans',
  ]);
});

it('on a laptop, fills the room up to FILL_MAX with the sections side by side', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await render(page());
  expect(content()).toMatchObject({ maxWidth: FILL_MAX, alignSelf: 'flex-start' });
  // Beside the rail alone, 1440 has room for three.
  const columns = screen.getAllByTestId('kinds-column');
  expect(columns).toHaveLength(3);
  expect(columns[0]).toHaveStyle({ flex: 1, gap: SECTION_GAP });
  expect(screen.getByTestId('pair-start')).toHaveTextContent('Includes');
  expect(screen.getByTestId('pair-end')).toHaveTextContent('Plans');
});

it("keeps a page that doesn't fill to one column on a laptop", async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await render(page({ fills: false }));
  expect(content()).toMatchObject({ maxWidth: CONTENT_MAX });
  expect(screen.queryAllByTestId('kinds-column')).toHaveLength(0);
  expect(screen.queryByTestId('pair-start')).toBeNull();
});
