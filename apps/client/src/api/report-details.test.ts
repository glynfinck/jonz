import { forgetDetails, noteError, notePage, pageName, pagesLine, reportDetails, webAppLine } from './report-details';

beforeEach(() => forgetDetails());

it('names a page from its path, leaving out ids and join codes', () => {
  expect(pageName('/today')).toBe('Today');
  expect(pageName('/house/history')).toBe('House › History');
  expect(pageName('/house/reports/0b6c8f3e-2f1d-4d33-9a51-6c1b1e0f5a77')).toBe('House › Reports');
  expect(pageName('/join/AB3DEF7H')).toBe('Join');
  expect(pageName('/house/moving-out?x=1')).toBe('House › Moving out');
  expect(pageName('/')).toBe('Front door');
});

it('keeps the last pages, once each in a row, and says the last two oldest first', () => {
  for (const path of ['/today', '/today', '/week', '/house', '/house']) notePage(path);
  expect(pagesLine()).toBe('Week, then House');
  expect(pagesLine([])).toBeUndefined();
});

it('says which browser and device, in a few words', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
  const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0';
  expect(webAppLine(iphone)).toBe('Jonz on the web, Safari 18, iPhone');
  expect(webAppLine(android)).toBe('Jonz on the web, Chrome 130, Android');
  expect(webAppLine(edge)).toBe('Jonz on the web, Edge 130, Windows');
  expect(webAppLine(firefox)).toBe('Jonz on the web, Firefox 132, Mac');
  expect(webAppLine('')).toBe('Jonz on the web, a browser');
});

it('carries the pages, the app, the house and the last error, and nothing it does not have', () => {
  expect(reportDetails(null)).toEqual({ app: expect.any(String) });
  notePage('/today');
  noteError('Couldn’t read the week.');
  expect(reportDetails('The Annexe')).toEqual({ pages: 'Today', app: expect.any(String), house: 'The Annexe', error: 'Couldn’t read the week.' });
});
