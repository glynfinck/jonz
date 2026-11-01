import type { Href } from 'expo-router';

import { Button, type ButtonIcon } from '@/components/button';

/**
 * An icon-only control: close, the title bar's ••• and sparkles, a step back
 * or on. One size everywhere (an ICON_ONLY glyph in a TAP square) and one
 * look: no edge, or with `outline` the outline button's edge, never heavier.
 * `label` is what a screen reader says, so it is required. `expanded` is for
 * one that opens a panel or menu; `ink` for one on a coloured band.
 */
export function IconButton({
  icon,
  label,
  onPress,
  href,
  outline = false,
  disabled,
  expanded,
  ink,
  testID,
}: {
  icon: ButtonIcon;
  label: string;
  onPress?: () => void;
  href?: Href;
  outline?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  ink?: string;
  testID?: string;
}) {
  return (
    <Button
      variant={outline ? 'outline' : 'ghost'}
      icon={icon}
      label={label}
      iconOnly
      onPress={onPress}
      href={href}
      disabled={disabled}
      expanded={expanded}
      ink={ink}
      testID={testID}
    />
  );
}
