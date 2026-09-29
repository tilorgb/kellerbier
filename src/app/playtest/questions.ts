import type { DictKey } from '../../i18n/translate.js';

/**
 * The post-run questions — `docs/PLAYTEST_PROTOCOL.md` §6's five, in the
 * order the protocol lists them. One is asked per run, rotating, so a
 * tester who plays five runs answers all five without ever facing a survey.
 *
 * `id` is what the report groups by; `textKey` is the wording, which lives
 * in the dictionaries so it is translated with everything else. They ask
 * what the tester *did* and *hit*, never whether they liked it
 * (§5 "what is deliberately not asked").
 */
export interface PlaytestQuestion {
  readonly id: string;
  readonly textKey: DictKey;
}

export const PLAYTEST_QUESTIONS: readonly PlaytestQuestion[] = [
  { id: 'what-is-it', textKey: 'ui.playtest.q.whatIsIt' },
  { id: 'confusion', textKey: 'ui.playtest.q.confusion' },
  { id: 'item', textKey: 'ui.playtest.q.item' },
  { id: 'blocked', textKey: 'ui.playtest.q.blocked' },
  { id: 'again', textKey: 'ui.playtest.q.again' },
];

/** The question for a cursor value, wrapping. */
export function questionAt(cursor: number): PlaytestQuestion {
  const count = PLAYTEST_QUESTIONS.length;
  const question = PLAYTEST_QUESTIONS[((cursor % count) + count) % count];
  if (question === undefined) {
    throw new Error('PLAYTEST_QUESTIONS is empty');
  }
  return question;
}
