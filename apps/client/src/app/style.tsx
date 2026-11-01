import { StyleBook } from '@/components/style-page/style-book';
import { STYLE_PAGE } from '@/components/style-page/enabled';

import NotFound from './+not-found';

/**
 * /style: the house style's building blocks and sample pages, at whatever
 * width the window is, in Day or Night as the device is. Hidden: not linked
 * from anywhere, and production shows the not-found page (enabled.ts).
 * docs/style/README.md says how to use it.
 */
export default function Style() {
  return STYLE_PAGE ? <StyleBook /> : <NotFound />;
}
