import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mailbox = readFileSync(
  new URL('../../app/dashboard/mails/MailboxClient.tsx', import.meta.url),
  'utf8',
);

test('iNrSend does not read browser cache during the hydration initializer', () => {
  assert.match(
    mailbox,
    /useState<InrSendDefaultSnapshot \| null>\(null\)/,
  );
  assert.doesNotMatch(
    mailbox,
    /useState<InrSendDefaultSnapshot \| null>\(\(\) =>\s*readModuleSnapshot/,
  );
  assert.match(mailbox, /setHistoryCacheHydrated\(true\)/);
});

test('history fetch waits for the cached snapshot restoration pass', () => {
  assert.match(
    mailbox,
    /useEffect\(\(\) => \{\s*if \(!historyCacheHydrated\) return;\s*void loadHistory/,
  );
  assert.match(mailbox, /silent: Boolean\(initialHistorySnapshot\)/);
});
