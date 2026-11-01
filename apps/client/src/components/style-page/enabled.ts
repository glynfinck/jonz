import { ON_STAGING } from '@/api/staging';

/**
 * Whether this build shows the style page (/style): every building block on
 * one page, for people and agents to check a change against, and for the
 * screenshot tests (apps/api/e2e/client-style.spec.ts). Shown when running
 * locally, on staging and its previews, and in a build made with
 * EXPO_PUBLIC_STYLE_PAGE=1 (the e2e's). Production says the page isn't there.
 */
export const STYLE_PAGE = __DEV__ || ON_STAGING || process.env.EXPO_PUBLIC_STYLE_PAGE === '1';
