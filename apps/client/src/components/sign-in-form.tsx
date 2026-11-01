import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * One step of a sign-in form. On a phone it's a plain column: each field's
 * own `onSubmitEditing` moves on. The web build (sign-in-form.web.tsx) makes
 * it a real form, which password managers look for.
 */
export function SignInForm({
  children,
  style,
}: {
  onSubmit: () => void;
  children: ReactNode;
  style?: object;
}) {
  return <View style={style}>{children}</View>;
}

/** Tells a password manager whose password this is, where the form has no email box. Web only. */
export function HiddenUsername(_: { email: string }) {
  return null;
}
