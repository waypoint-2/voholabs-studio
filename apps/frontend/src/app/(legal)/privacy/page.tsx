import { Metadata } from 'next';
import { LegalPage, LegalSection, LegalList } from '../legal.layout';

export const metadata: Metadata = {
  title: 'Voholabs Studio Privacy Policy',
  description:
    'How Voholabs Studio collects, uses, shares, stores and deletes personal data, including data obtained from connected social media platforms such as TikTok, YouTube, Facebook, Instagram and Threads.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Voholabs Studio Privacy Policy"
      updated="4 October 2026"
      intro={
        <>
          Voholabs Studio is a social media scheduling and publishing tool
          operated by Voholabs Ltd. This policy explains what personal data
          Voholabs Studio collects, why we collect it, who we share it with, how
          long we keep it, and the rights you have over it. It applies to
          everything at studio.voholabs.com and to the data we obtain from
          social media platforms you choose to connect, including TikTok,
          YouTube, Facebook, Instagram and Threads. If you are here to delete
          your data, see{' '}
          <a className="underline" href="#data-deletion">
            section 10, Deleting your data
          </a>
          .
        </>
      }
    >
      <LegalSection id="controller" title="1. Who we are">
        <p>
          The data controller is Voholabs Ltd, a company incorporated in England
          and Wales, operating the Voholabs Studio service at
          studio.voholabs.com. You can reach us about anything in this policy at{' '}
          <a className="underline" href="mailto:hello@voholabs.com">
            hello@voholabs.com
          </a>
          .
        </p>
        <p>
          We act as a data controller for your Voholabs Studio account data, and
          as a processor acting on your instructions for the content you
          schedule and publish to your connected channels.
        </p>
      </LegalSection>

      <LegalSection id="data" title="2. Data we collect">
        <p>We collect the following categories of personal data:</p>
        <LegalList
          items={[
            <>
              <strong>Account data</strong> — your name, email address, hashed
              password or third-party sign-in identifier, organisation name, and
              team membership.
            </>,
            <>
              <strong>Content data</strong> — the posts, captions, images,
              videos and schedules you create in Voholabs Studio, along with any
              media you upload to the media library.
            </>,
            <>
              <strong>Connected channel data</strong> — access tokens, refresh
              tokens, channel identifiers, profile names, avatars and analytics
              returned by the social media platforms you connect.
            </>,
            <>
              <strong>Billing data</strong> — subscription tier and payment
              status. Card details are handled directly by Stripe and are never
              stored on our servers.
            </>,
            <>
              <strong>Technical data</strong> — IP address, browser and device
              information, and error and usage logs generated when you use the
              service.
            </>,
            <>
              <strong>Product usage data:</strong> which screens you open and
              which features you use (for example connecting a channel,
              scheduling a post or topping up the wallet), linked to your account
              and organisation IDs and your plan. It never includes the text or
              media of your posts, what you type into forms, or your name or
              email address, we do not record your screen, and no cookie is set
              for it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="tiktok" title="3. TikTok data — what we access and why">
        <p>
          When you connect a TikTok account to Voholabs Studio, you are taken to
          TikTok&apos;s own login and consent screen. TikTok, not Voholabs
          Studio, authenticates you; we never see or store your TikTok password.
          TikTok then returns an access token that we use strictly within the
          scopes you approved:
        </p>
        <LegalList
          items={[
            <>
              <strong>user.info.basic</strong> — your TikTok open ID, display
              name and avatar, so we can show you which account a post will be
              published to.
            </>,
            <>
              <strong>user.info.profile</strong> — your profile handle,
              biography and profile link, shown in the channel settings and post
              preview.
            </>,
            <>
              <strong>user.info.stats</strong> — aggregate follower, following,
              like and video counts, shown on the analytics screen.
            </>,
            <>
              <strong>video.list</strong> — metadata for videos already
              published on your account (title, cover image, view, like, comment
              and share counts), used to populate your analytics.
            </>,
            <>
              <strong>video.upload</strong> and <strong>video.publish</strong> —
              used only to upload and publish the specific videos you have
              created and scheduled inside Voholabs Studio, at the time you
              scheduled them.
            </>,
          ]}
        />
        <p>
          We do not use TikTok data for advertising, profiling, credit or
          insurance decisions, training machine learning models, or building
          audience segments. We do not sell TikTok data, and we do not share it
          with any third party other than the infrastructure providers listed in
          section 8 that host the service on our behalf.
        </p>
        <p>
          You can remove a TikTok channel at any time from the launches screen
          in Voholabs Studio (see section 10). Doing so revokes our access token
          with TikTok and erases the stored tokens straight away. Cached TikTok
          analytics expire within an hour. The channel's name and picture stay
          attached to posts you published through it until you delete those
          posts or your account. You can also revoke access directly
          from the TikTok app under Settings and privacy. Content already
          published to TikTok remains on TikTok and is governed by TikTok&apos;s
          own policies.
        </p>
        <p>
          Your use of TikTok through Voholabs Studio is also subject to
          TikTok&apos;s Privacy Policy and Terms of Service.
        </p>
      </LegalSection>

      <LegalSection
        id="youtube"
        title="4. YouTube data — what we access and why"
      >
        <p>
          Voholabs Studio uses the YouTube API Services. When you connect a
          YouTube channel, you are taken to Google&apos;s own login and consent
          screen. Google, not Voholabs Studio, authenticates you; we never see
          or store your Google password. Google then returns an access token
          that we use strictly within the scopes you approved:
        </p>
        <LegalList
          items={[
            <>
              <strong>youtube.upload</strong> — used only to upload and publish
              the specific videos you have created and scheduled inside Voholabs
              Studio, at the time you scheduled them, together with the title,
              description, tags, privacy setting, made-for-kids declaration and
              custom thumbnail you entered in our composer.
            </>,
            <>
              <strong>youtube.readonly</strong> — the list of channels you own,
              with their names and avatars, so you can choose which channel to
              publish to and tell your connected channels apart; and the view,
              like and comment counts for videos on your channel, shown on your
              analytics screen. We only read with this scope; we never write.
            </>,
            <>
              <strong>yt-analytics.readonly</strong> — aggregate statistics for
              your own channel (views, estimated minutes watched, average view
              duration, average view percentage, subscribers gained and lost,
              and likes, broken down by day) used to render your analytics
              dashboard.
            </>,
            <>
              <strong>userinfo.profile</strong> — your Google account
              identifier, display name and avatar, read once when you connect,
              so we can label the connected account in your channel list. We do
              not request access to your email address.
            </>,
          ]}
        />
        <p>
          We do not use YouTube data for advertising, profiling, credit or
          insurance decisions, training machine learning models, or building
          audience segments. We do not sell YouTube data, and we do not share it
          with any third party other than the infrastructure providers listed in
          section 8 that host the service on our behalf. Our use and transfer of
          information received from Google APIs adheres to the{' '}
          <a
            className="underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          You can remove a YouTube channel at any time from the launches screen
          in Voholabs Studio (see section 10). Doing so erases the stored
          tokens straight away. Cached YouTube analytics expire within an hour.
          The channel's name and picture stay attached to posts you published
          through it until you delete those posts or your account.
          You can also revoke our access directly from your{' '}
          <a
            className="underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            Google account security settings
          </a>
          . Content already published to YouTube remains on YouTube and is
          governed by YouTube&apos;s own policies.
        </p>
        <p>
          Your use of YouTube through Voholabs Studio is also subject to the{' '}
          <a
            className="underline"
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
          >
            YouTube Terms of Service
          </a>{' '}
          and the{' '}
          <a
            className="underline"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Google Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection
        id="meta"
        title="5. Meta data (Facebook, Instagram and Threads) — what we access and why"
      >
        <p>
          When you connect a Facebook Page, an Instagram professional account or
          a Threads profile, you are taken to Meta&apos;s own login and consent
          screen. Meta, not Voholabs Studio, authenticates you; we never see or
          store your Facebook, Instagram or Threads password. Meta then returns
          an access token that we use strictly within the permissions you
          approved:
        </p>
        <p>
          <strong>Facebook Pages.</strong> <strong>pages_show_list</strong> and{' '}
          <strong>business_management</strong> to list the Pages you manage so
          you can choose which one to publish to;{' '}
          <strong>pages_manage_posts</strong> to publish the posts you composed
          and scheduled in Voholabs Studio;{' '}
          <strong>pages_manage_engagement</strong> to publish the comments you
          scheduled alongside a post; <strong>pages_read_engagement</strong> and{' '}
          <strong>read_insights</strong> to read back the Page name, avatar and
          the engagement and reach figures shown on your analytics screen.
        </p>
        <p>
          <strong>Instagram.</strong> <strong>instagram_basic</strong> (or{' '}
          <strong>instagram_business_basic</strong> where you connect with
          Instagram Login) to read the account handle, name and avatar so you
          can tell your connected accounts apart;{' '}
          <strong>instagram_content_publish</strong> (or{' '}
          <strong>instagram_business_content_publish</strong>) to publish the
          images, videos, reels and carousels you scheduled;{' '}
          <strong>instagram_manage_comments</strong> (or{' '}
          <strong>instagram_business_manage_comments</strong>) to publish the
          first comment you scheduled with a post; and{' '}
          <strong>instagram_manage_insights</strong> (or{' '}
          <strong>instagram_business_manage_insights</strong>) to read the
          reach, impression, like and comment counts shown on your analytics
          screen.
        </p>
        <p>
          <strong>Threads.</strong> <strong>threads_basic</strong> to read your
          Threads profile handle and avatar;{' '}
          <strong>threads_content_publish</strong> to publish the threads you
          scheduled; <strong>threads_manage_replies</strong> to publish the
          replies you scheduled as part of a thread; and{' '}
          <strong>threads_manage_insights</strong> to read the view, like, reply
          and repost counts shown on your analytics screen.
        </p>
        <p>
          We access this data only to provide the scheduling, publishing and
          analytics features you asked for. We do not use Meta data for
          advertising, profiling, credit or insurance decisions, training
          machine learning models, or building audience segments. We do not sell
          Meta data, and we do not share it with any third party other than the
          infrastructure providers listed in section 8 that host the service on
          our behalf. Our use of Meta platform data complies with the{' '}
          <a
            className="underline"
            href="https://developers.facebook.com/terms/"
            target="_blank"
            rel="noreferrer"
          >
            Meta Platform Terms
          </a>{' '}
          and{' '}
          <a
            className="underline"
            href="https://developers.facebook.com/devpolicy/"
            target="_blank"
            rel="noreferrer"
          >
            Developer Policies
          </a>
          .
        </p>
        <p>
          You can remove a Facebook, Instagram or Threads channel at any time
          from the launches screen in Voholabs Studio, which erases the stored
          tokens straight away. Cached analytics expire within an hour, and the
          channel's name and picture stay attached to posts you published
          through it until you delete those posts or your account. See section
          10 for full deletion instructions. You can also revoke our
          access directly from{' '}
          <a
            className="underline"
            href="https://www.facebook.com/settings?tab=business_tools"
            target="_blank"
            rel="noreferrer"
          >
            Facebook Settings → Business Integrations
          </a>
          . Content already published remains on the platform and is governed by
          Meta&apos;s own policies.
        </p>
        <p>
          Your use of these platforms through Voholabs Studio is also subject to
          the{' '}
          <a
            className="underline"
            href="https://www.facebook.com/privacy/policy/"
            target="_blank"
            rel="noreferrer"
          >
            Meta Privacy Policy
          </a>
          . Voholabs Studio is an independent product and is not endorsed by,
          affiliated with, or sponsored by Meta Platforms, Inc.
        </p>
      </LegalSection>

      <LegalSection id="other-platforms" title="6. Other connected platforms">
        <p>
          The same principles apply to every other channel Voholabs Studio
          supports — including X, LinkedIn, Pinterest, Reddit, Mastodon,
          Bluesky, Discord, Slack and Telegram. In each case we request the
          narrowest set of permissions needed to publish the content you
          schedule and to read back the analytics for the posts you published,
          we store only the tokens and identifiers required to do so, and we
          delete them when you disconnect the channel.
        </p>
      </LegalSection>

      <LegalSection id="purposes" title="7. Why we use your data">
        <LegalList
          items={[
            <>
              To provide the service — publishing your scheduled posts,
              rendering your calendar, and reporting analytics. This is
              necessary to perform our contract with you.
            </>,
            <>
              To operate and secure the platform — authentication, abuse
              prevention, backups, and diagnosing errors. This is in our
              legitimate interest in running a reliable service.
            </>,
            <>
              To understand which features are used and which are not, so we
              can improve the product, using the product usage data above. This
              is in our legitimate interest in improving the service.
            </>,
            <>
              To take payment and manage subscriptions, which is necessary to
              perform our contract with you.
            </>,
            <>
              To send service and account notifications, and to contact you about
              Voholabs services using the details you gave us when you signed
              up. You can opt out of that contact at any time by replying or
              using the link in the message.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="recipients" title="8. Who we share data with">
        <p>
          We do not sell personal data. We share it only with providers that
          process it on our instructions under contract:
        </p>
        <LegalList
          items={[
            <>
              The social media platforms you explicitly connect, in order to
              publish your content and retrieve its analytics.
            </>,
            <>
              Cloud hosting, database, object storage and queue providers that
              run the service.
            </>,
            <>Stripe, for subscription payments.</>,
            <>
              Error monitoring and product analytics providers (product
              analytics: PostHog, hosted in the United States), used to keep the
              service working and to improve it.
            </>,
            <>
              Professional advisers, or authorities where we are legally
              required to disclose.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="retention" title="9. How long we keep data">
        <LegalList
          items={[
            <>
              Account and content data: for as long as your account is active.
            </>,
            <>
              Connected channel tokens: until you disconnect the channel or
              delete your account, when they are erased. Cached analytics: up
              to an hour. A channel's name and picture: until you delete the
              posts published through it or your account.
            </>,
            <>Billing records: six years, as required by UK tax law.</>,
            <>Technical and error logs: up to 90 days.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="data-deletion" title="10. Deleting your data">
        <p>
          You can delete the data Voholabs Studio holds about you at any time,
          in whichever of these ways suits you:
        </p>
        <LegalList
          items={[
            <>
              <strong>Remove a single channel yourself.</strong> Open the
              launches screen, click the preferences menu on the channel you
              want to remove, and choose <em>Delete Channel</em>. This
              immediately erases our stored access and refresh tokens for that
              channel. Cached analytics for it expire within an hour, and its
              name and picture stay attached to posts you published through it
              until you delete those posts or your account. If the channel still has posts
              attached, delete those posts from the calendar first.
            </>,
            <>
              <strong>Delete your whole account.</strong> Email{' '}
              <a className="underline" href="mailto:hello@voholabs.com">
                hello@voholabs.com
              </a>{' '}
              from the address registered on your account with the subject{' '}
              <em>Delete my account</em>. We verify the request, confirm to you
              within one month, and permanently remove your account, your posts
              and media, every connected channel and all associated platform
              data within 30 days of confirming. You can also use the same
              address to ask us to delete a specific subset of your data.
            </>,
            <>
              <strong>Revoke access at the platform.</strong> You can
              independently revoke our access from the platform itself — Meta
              via{' '}
              <a
                className="underline"
                href="https://www.facebook.com/settings?tab=business_tools"
                target="_blank"
                rel="noreferrer"
              >
                Facebook Settings → Business Integrations
              </a>
              , Google and YouTube via{' '}
              <a
                className="underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
              >
                Google account permissions
              </a>
              , and TikTok under Settings and privacy in the TikTok app.
            </>,
          ]}
        />
        <p>
          Deletion covers our live systems. Copies that remain in backups are
          overwritten as those backups expire. We keep only
          what law requires us to keep — billing records for six years under UK
          tax law. Content you already published to a social platform stays on
          that platform; deleting it there is done from the platform itself.
        </p>
      </LegalSection>

      <LegalSection id="security" title="11. Security">
        <p>
          Traffic to and from the service is encrypted in transit with TLS. Access
          tokens are stored in our database so that we can publish for you, and
          you can revoke them at the platform at any time. Access to production systems is
          restricted to the personnel who need it. No system is perfectly
          secure, but we take reasonable and appropriate technical and
          organisational measures to protect your data, and we will notify you
          and the relevant regulator of a qualifying breach without undue delay.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="12. International transfers">
        <p>
          Some of our providers are located outside the UK and the EEA. Where
          data is transferred, we rely on UK adequacy regulations or on the
          International Data Transfer Agreement or the UK Addendum to the EU
          Standard Contractual Clauses.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="13. Your rights">
        <p>
          Subject to the conditions in applicable data protection law, you have
          the right to access, correct, delete, restrict, port and object to our
          processing of your personal data, and to withdraw consent where
          processing is based on consent.
        </p>
        <p>
          You can exercise any of these rights, including deleting your account
          and all associated data, by emailing{' '}
          <a className="underline" href="mailto:hello@voholabs.com">
            hello@voholabs.com
          </a>
          — see{' '}
          <a className="underline" href="#data-deletion">
            section 10
          </a>{' '}
          for step-by-step instructions. We respond to requests within one
          month. If you are unhappy with how we handled your data you can
          complain to the UK Information Commissioner&apos;s Office at
          ico.org.uk.
        </p>
      </LegalSection>

      <LegalSection id="children" title="14. Children">
        <p>
          Voholabs Studio is not directed at children. You must be at least 18
          years old, or the minimum age required by the platforms you connect,
          whichever is higher, to use the service.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="15. Changes to this policy">
        <p>
          We may update this policy from time to time. The date at the top of
          this page shows when it last changed, and we will notify account
          holders by email of any material change before it takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
