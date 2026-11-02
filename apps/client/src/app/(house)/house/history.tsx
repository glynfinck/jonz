import { Redirect } from 'expo-router';

/** History is on the Wall now, beside what the house did: an old link lands there, on History. */
export default function HistoryScreen() {
  return <Redirect href={{ pathname: '/house/wall', params: { view: 'history' } }} />;
}
