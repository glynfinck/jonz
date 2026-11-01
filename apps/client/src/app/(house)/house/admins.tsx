import { Redirect } from 'expo-router';

/** Admins are on the Rules page now, beside the rules they can change: an old link lands there. */
export default function AdminsScreen() {
  return <Redirect href="/house/rules" />;
}
