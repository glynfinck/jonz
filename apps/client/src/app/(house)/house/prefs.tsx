import { Redirect } from 'expo-router';

/** Preferences are on Days and time away now: an old link lands there. */
export default function PrefsScreen() {
  return <Redirect href="/house/away" />;
}
