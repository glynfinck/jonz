import { Children, createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { BUTTON_MIN, NARROW, SPACE } from '@/theme';

/**
 * How a Button inside a ButtonRow sits: an equal share of a line, or the full
 * width of a stack. `wrapped` is how a sharing button says its words took
 * more than one line, so the row stacks instead.
 */
interface RowFit {
  fit: 'share' | 'full';
  wrapped: () => void;
}

const RowFitContext = createContext<RowFit | null>(null);

/** For `Button`: whether it sits in a ButtonRow, and how. */
export function useRowFit(): RowFit | null {
  return useContext(RowFitContext);
}

/**
 * Two or three buttons that belong together: Mark done and Photo, Approve and
 * Object, Mark fixed and Same as. They always share the line equally, never
 * sized to their words, and are always the same height. When the row is too
 * narrow for each to have BUTTON_MIN (a small phone, a narrow side panel),
 * or the window is under NARROW, or any button's words would take two
 * lines, they stack at full width, in the order
 * given: put the main action first. Never lay buttons side by side by hand
 * (the lint rule `jonz/no-hand-made-button-row` says so).
 */
export function ButtonRow({
  children,
  stacked: stackedAlways = false,
  testID,
}: {
  children: ReactNode;
  /** Always one under another (the front door's two ways in on a phone). */
  stacked?: boolean;
  testID?: string;
}) {
  const { width: window } = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  // The widest the row has been while a label still wrapped: at that width
  // or narrower it stays stacked (stacked, the words fit on one line, so
  // the buttons can't be asked again without flickering).
  const [wrapsAt, setWrapsAt] = useState(0);
  const count = Children.toArray(children).filter(Boolean).length;
  const needs = count * BUTTON_MIN + (count - 1) * SPACE.sm;
  const stacked = stackedAlways || window < NARROW || (width !== null && (width < needs || width <= wrapsAt));
  // A label can say it wrapped before the row knows its own width (children
  // are laid out first), so the news waits until the width arrives.
  const widthNow = useRef<number | null>(null);
  const wrapPending = useRef(false);
  const wrapped = useCallback(() => {
    const at = widthNow.current;
    if (at === null) wrapPending.current = true;
    else setWrapsAt((was) => Math.max(was, at));
  }, []);
  const value = useMemo<RowFit>(() => ({ fit: stacked ? 'full' : 'share', wrapped }), [stacked, wrapped]);
  return (
    <RowFitContext.Provider value={value}>
      <View
        testID={testID}
        onLayout={(event) => {
          const at = event.nativeEvent.layout.width;
          widthNow.current = at;
          setWidth(at);
          if (wrapPending.current) {
            wrapPending.current = false;
            setWrapsAt((was) => Math.max(was, at));
          }
        }}
        style={stacked ? styles.stack : styles.row}
      >
        {children}
      </View>
    </RowFitContext.Provider>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: SPACE.sm },
  stack: { flexDirection: 'column', alignItems: 'stretch', gap: SPACE.sm },
});
