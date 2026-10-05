// @ts-ignore twitter-text has no types
import twitter from 'twitter-text';

// A "(post:<id>)" reference becomes the referenced post's URL at publish.
export const POST_REFERENCE_REGEX = /\(post:[a-zA-Z0-9-_]+\)/g;

// Stands in for a reference's URL until it is resolved. An https URL, so link
// stripping removes it exactly as it removes the real one.
const REFERENCE_URL = 'https://studio.voholabs.com/p/reference';

// Whether a text carries a link by X's own URL rules (bare domains such as
// example.com count), with "(post:<id>)" references counted as the URLs they
// become.
export const textHasLink = (text: string) =>
  (
    twitter.extractUrls(
      (text || '').replace(POST_REFERENCE_REGEX, REFERENCE_URL)
    ) as string[]
  ).length > 0;

// The action an X post is charged as, on the exact text sent to X, after any
// link stripping. Prefer WalletService.postActionKey, which also handles
// unsent content and other providers.
export const xPostActionKey = (text: string) =>
  textHasLink(text) ? 'x.post_link' : 'x.post';

export const referenceUrlPlaceholder = REFERENCE_URL;

// Marks the integration handed to a provider's post/comment when the wallet
// pays for that publish, so the provider can apply the stricter reading of
// the network's answer that charging needs. Any other publish (a paid plan,
// a channel the wallet does not charge) gets the integration unchanged.
export const withWalletPublish = <T extends object>(
  integration: T,
  walletPays: boolean
): T => (walletPays ? { ...integration, walletPublish: true } : integration);

export const isWalletPublish = (integration: unknown) =>
  !!(integration as { walletPublish?: boolean } | undefined)?.walletPublish;
