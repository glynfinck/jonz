import { createElement, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

/**
 * One step of a sign-in form, as a real <form>: password managers (Dashlane,
 * 1Password, the browser's own) look for one before they offer to fill, save
 * or make up a password. Enter in any box sends it, through the hidden submit
 * input; the page never reloads.
 */
export function SignInForm({
  onSubmit,
  children,
  style,
}: {
  onSubmit: () => void;
  children: ReactNode;
  style?: object;
}) {
  return createElement(
    'form',
    {
      noValidate: true,
      method: 'post',
      action: '#',
      style: StyleSheet.flatten([styles.form, style]),
      onSubmit: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        onSubmit();
      },
    },
    children,
    createElement('input', {
      type: 'submit',
      hidden: true,
      tabIndex: -1,
      'aria-hidden': true,
    }),
  );
}

/**
 * Tells a password manager whose password this is, where the form has no
 * email box (reset, and changing it in House → You): a hidden username, as
 * Chrome's and Apple's guides ask.
 */
export function HiddenUsername({ email }: { email: string }) {
  return createElement('input', {
    type: 'text',
    name: 'username',
    autoComplete: 'username',
    value: email,
    readOnly: true,
    hidden: true,
    tabIndex: -1,
    'aria-hidden': true,
  });
}

const styles = StyleSheet.create({
  form: { display: 'flex', flexDirection: 'column' },
});
