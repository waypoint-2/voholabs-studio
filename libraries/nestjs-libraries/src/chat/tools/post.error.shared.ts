import {
  walletErrorKind,
  walletErrorText,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

// A post's stored `error` is either a short message the workflow wrote, or a
// whole serialized Temporal failure (stack traces, encoded payloads, file
// paths, worker ids). The agent gets one readable line and a kind it can act
// on; the stored error itself is left as it is.

export const POST_ERROR_KINDS = [
  'wallet',
  'refresh_needed',
  'channel_disabled',
  'reference',
  'provider',
  'unknown',
] as const;

export type PostErrorKindForAgent = (typeof POST_ERROR_KINDS)[number];

export const POST_ERROR_MAX = 200;

const REFRESH_MESSAGE =
  "The channel's login expired and could not be refreshed. Reconnect the channel, then put the post back on the schedule.";
const DISABLED_MESSAGE =
  'The channel is disabled. Enable it, then put the post back on the schedule.';
const GENERIC_MESSAGE = 'The post could not be published.';

// One line, no file paths, stack frames, long encoded strings or ids in
// brackets, and no longer than max.
export const cleanErrorText = (text: unknown, max = POST_ERROR_MAX): string => {
  if (typeof text !== 'string') {
    return '';
  }
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^at\s/.test(line)) || '';

  const cleaned = firstLine
    // file:///app/x.js:1:2, /app/libraries/x.ts:10:5, C:\x\y.ts
    .replace(/\(?(?:file:\/\/)?(?<![\w:/.])(?:\/[\w.@-]+){2,}(?::\d+)*\)?/g, '')
    .replace(/\(?[A-Za-z]:\\[^\s)]+\)?/g, '')
    // " at fn (...)" fragments left on the same line
    .replace(/\s+at\s+\S+\s*\(\s*\)/g, '')
    // base64 or hex blobs
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;])/g, '$1')
    .trim()
    // "... at" left behind by a removed path
    .replace(/\s+at$/, '');

  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
};

const parseFailure = (error: string): any => {
  const trimmed = error.trim();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch (err) {
    return undefined;
  }
};

// The innermost failure type and message of a serialized Temporal failure.
const readFailure = (failure: any) => {
  const proto = failure?.failure;
  const type =
    failure?.cause?.type ||
    proto?.cause?.applicationFailureInfo?.type ||
    proto?.applicationFailureInfo?.type ||
    failure?.type ||
    '';
  const message =
    proto?.cause?.message ||
    failure?.cause?.message ||
    (typeof failure?.message === 'string' ? failure.message : '') ||
    proto?.message ||
    '';
  return { type: String(type), message: String(message) };
};

/**
 * What the agent is told about a failed post: a short reason and its kind.
 * Returns nulls for a post with no error.
 */
export const describePostError = (
  error?: string | null,
  serverKind?: string | null
): { error: string | null; errorKind: PostErrorKindForAgent | null } => {
  if (!error) {
    return { error: null, errorKind: null };
  }

  if (walletErrorKind(error, serverKind) === 'wallet') {
    return {
      error: cleanErrorText(walletErrorText(error, 'wallet')) || GENERIC_MESSAGE,
      errorKind: 'wallet',
    };
  }

  const failure = parseFailure(error);
  const { type, message } = failure
    ? readFailure(failure)
    : { type: '', message: error };

  if (type === 'refresh_token' || /^refresh channel needed/i.test(message)) {
    return { error: REFRESH_MESSAGE, errorKind: 'refresh_needed' };
  }

  if (/^channel disabled/i.test(message)) {
    return { error: DISABLED_MESSAGE, errorKind: 'channel_disabled' };
  }

  if (
    type === 'unresolved_post_reference' ||
    /links to (a post|posts) that/i.test(message)
  ) {
    return {
      error: cleanErrorText(message) || GENERIC_MESSAGE,
      errorKind: 'reference',
    };
  }

  if (type === 'bad_body') {
    const reason = cleanErrorText(message);
    return {
      error: reason
        ? cleanErrorText(`The platform rejected the post: ${reason}`)
        : 'The platform rejected the post.',
      errorKind: 'provider',
    };
  }

  // A serialized failure with nothing recognisable in it: its message is the
  // generic "Activity task failed", which says nothing useful.
  if (failure) {
    const reason = cleanErrorText(message);
    return {
      error:
        reason && !/^activity task failed/i.test(reason)
          ? reason
          : GENERIC_MESSAGE,
      errorKind: 'unknown',
    };
  }

  return {
    error: cleanErrorText(message) || GENERIC_MESSAGE,
    errorKind: 'unknown',
  };
};

// For a thrown error's message on its way back to the agent.
export const errorMessageForAgent = (err: unknown) =>
  (err instanceof Error ? cleanErrorText(err.message) : '') ||
  'Unexpected error';
