import { Redirect } from 'expo-router';

/** Groups are on the John list now, among the Johns they share: an old link lands there. */
export default function GroupsScreen() {
  return <Redirect href="/house/johns" />;
}
