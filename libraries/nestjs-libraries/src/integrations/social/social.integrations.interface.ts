import { Integration } from '@prisma/client';
import {
  RecentMediaOptions,
  RecentMediaPage,
} from '@gitroom/nestjs-libraries/integrations/social/recent.media';

export interface ClientInformation {
  client_id: string;
  client_secret: string;
  instanceUrl: string;
}
export interface IAuthenticator {
  authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ): Promise<AuthTokenDetails | string>;
  refreshToken(refreshToken: string): Promise<AuthTokenDetails>;
  reConnect?(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>>;

  /**
   * The channel's avatar URL as the network reports it RIGHT NOW.
   *
   * Avatars are not copied into our storage - they are proxied and re-resolved,
   * so that changing a picture on the network shows up here, and so that a
   * signed URL (LinkedIn's expire) can be replaced rather than left to rot.
   * Optional: a provider that does not implement it falls back to the last
   * source URL we stored, which is still better than a copy that never updates.
   */
  currentProfilePicture?(
    accessToken: string,
    internalId: string
  ): Promise<string | undefined>;
  generateAuthUrl(
    clientInformation?: ClientInformation
  ): Promise<GenerateAuthUrlResponse>;
  analytics?(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]>;
  postAnalytics?(
    integrationId: string,
    accessToken: string,
    postId: string,
    fromDate: number,
  ): Promise<AnalyticsData[]>;
  // Read-only listing of the account's existing media (Instagram only today).
  // Backs GET /public/v1/integrations/:id/media; it must have no side effects.
  recentMedia?(
    id: string,
    accessToken: string,
    opts: RecentMediaOptions
  ): Promise<RecentMediaPage>;
  changeNickname?(
    id: string,
    accessToken: string,
    name: string
  ): Promise<{ name: string }>;
  changeProfilePicture?(
    id: string,
    accessToken: string,
    url: string
  ): Promise<{ url: string }>;
  missing?(
    id: string,
    accessToken: string
  ): Promise<{ id: string; url: string }[]>;
  // Revoke the OAuth grant on the platform side when a channel is deleted.
  // Optional: providers that do not expose a revoke endpoint simply omit it.
  revoke?(accessToken: string): Promise<boolean>;
}

export interface AnalyticsData {
  label: string;
  data: Array<{ total: string; date: string }>;
  percentageChange: number;
}


export type GenerateAuthUrlResponse = {
  url: string;
  codeVerifier: string;
  state: string;
};

export type AuthTokenDetails = {
  id: string;
  name: string;
  error?: string;
  accessToken: string; // The obtained access token
  refreshToken?: string; // The refresh token, if applicable
  expiresIn?: number; // The duration in seconds for which the access token is valid
  picture?: string;
  username: string;
  additionalSettings?: {
    title: string;
    description: string;
    type: 'checkbox' | 'text' | 'textarea';
    value: any;
    regex?: string;
  }[];
};

export interface ISocialMediaIntegration {
  post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]>; // Schedules a new post

  comment?(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]>; // Schedules a new post

  // Catches settings that are structurally valid but would fail at publish
  // time — a Discord channel the bot cannot post in, for example. Runs while
  // the post is being scheduled, so the user hears about it when they can
  // still fix it rather than from a failed post hours later. Returns true when
  // fine, or the message to show. Optional; best-effort, so it must not throw
  // for transient platform problems.
  validateSettings?(
    integration: Integration,
    settings: any,
    post: { hasMedia: boolean; content: string }
  ): Promise<string | true>;

  // Where inside the connected account this post lands — a Discord channel,
  // for one. A channel's name alone does not say it, and surfaces that show a
  // post without its settings form have no other way to tell one target from
  // another. Resolved when the post is read so it stays right even if the
  // target is renamed on the platform.
  describeTarget?(
    integration: Integration,
    settings: any
  ): Promise<string | undefined>;

  // Removes an already-published post from the platform itself. Deleting a post
  // in Voholabs Studio only clears our own calendar, so this is what actually takes the
  // message down. Optional: providers with no delete endpoint simply omit it.
  // `postId` is the platform id we stored as releaseId; `post` carries the
  // saved settings and the release URL, which is where a provider can recover
  // context the settings don't hold (a comment lives in a thread, not the
  // channel the settings name).
  deletePost?(
    id: string,
    accessToken: string,
    postId: string,
    post: { settings: any; releaseURL?: string | null },
    integration: Integration
  ): Promise<boolean>;
}

export type PostResponse = {
  id: string; // The db internal id of the post
  postId: string; // The ID of the scheduled post returned by the platform
  releaseURL: string; // The URL of the post on the platform
  status: string; // Status of the operation or initial post status
};

export type PostDetails<T = any> = {
  id: string;
  message: string;
  settings: T;
  media?: MediaContent[];
  poll?: PollDetails;
};

export type PollDetails = {
  options: string[]; // Array of poll options
  duration: number; // Duration in hours for which the poll will be active
};

export type MediaContent = {
  type: 'image' | 'video'; // Type of the media content
  path: string;
  alt?: string;
  thumbnail?: string;
  thumbnailTimestamp?: number;
};

export type FetchPageInformationResult = {
  id: string;
  name: string;
  access_token: string;
  picture: string;
  username: string;
};

export interface SocialProvider
  extends IAuthenticator,
    ISocialMediaIntegration {
  identifier: string;
  refreshWait?: boolean;
  convertToJPEG?: boolean;
  stripLinks?: () => boolean;
  refreshCron?: boolean;
  dto?: any;
  maxLength: (additionalSettings?: any) => number;
  checkValidity(
    posts: Array<{ path: string; thumbnail?: string }[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true>;
  isWeb3?: boolean;
  isChromeExtension?: boolean;
  extensionCookies?: { name: string; domain: string }[];
  editor: 'none' | 'normal' | 'markdown' | 'html';
  customFields?: () => Promise<
    {
      key: string;
      label: string;
      defaultValue?: string;
      validation: string;
      type: 'text' | 'password';
      hint?: string;
      // Blank is allowed. Without this every field is required, which is wrong
      // for anything the integration can work out for itself.
      optional?: boolean;
    }[]
  >;
  // Shown above the customFields form when connecting. A per-field `hint` is a
  // tooltip and is easy to miss; a provider whose credentials have to be
  // created by hand somewhere else needs the whole procedure visible before the
  // user starts typing. A link `url` may contain `{fieldKey}` placeholders,
  // which are filled in from what has been typed so far - that turns a generic
  // "go to your dashboard" into a link straight to the right project.
  customFieldsSetup?: {
    title: string;
    steps: string[];
    links?: { label: string; url: string }[];
  };
  name: string;
  toolTip?: string;
  oneTimeToken?: boolean;
  isBetweenSteps: boolean;
  scopes: string[];
  externalUrl?: (
    url: string
  ) => Promise<{ client_id: string; client_secret: string }>;
  mention?: (
    token: string,
    data: { query: string },
    id: string,
    integration: Integration
  ) => Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  >;
  mentionFormat?(idOrHandle: string, name: string): string;
  fetchPageInformation?(
    accessToken: string,
    data: any
  ): Promise<FetchPageInformationResult>;
}
