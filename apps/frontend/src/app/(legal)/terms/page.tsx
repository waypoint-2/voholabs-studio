import { Metadata } from 'next';
import { ReactNode } from 'react';
import {
  LegalPage,
  LegalSection,
  LegalList,
  LegalSummary,
} from '../legal.layout';

export const metadata: Metadata = {
  title: 'Voholabs Studio Terms of Service',
  description:
    'The terms governing use of Voholabs Studio, the free, community hosted social media scheduling tool. Provided as is, for business use.',
  alternates: { canonical: '/terms' },
};

// Changing this page in a way people have to agree to again means changing
// CURRENT_TERMS_VERSION (database/prisma/users/terms.ts) in the same commit.
// That is what asks everybody to agree to the new version.
//
// Editing notes:
//   - Keep section 14 as separate numbered paragraphs, with 14.1 first.
//   - Keep the summary box: it is part of the terms.
//   - Platform reviewers check this page: keep the page title, the YouTube
//     Terms of Service link and the Google Privacy Policy link.

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="underline" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

const Mail = () => (
  <a className="underline" href="mailto:hello@voholabs.com">
    hello@voholabs.com
  </a>
);

export default function TermsPage() {
  return (
    <LegalPage
      title="Voholabs Studio Terms of Service"
      updated="4 October 2026"
      intro={
        <>
          These terms are the agreement between you and us for Voholabs Studio,
          the social media scheduling tool at studio.voholabs.com. By creating
          an account, signing in, or using the service in any way, including
          through the API, a webhook, an MCP connection or an AI assistant, you
          agree to them. You confirm that by ticking the box when you sign up,
          and we keep a record of the version you agreed to, when, and from
          which IP address.
          If you use the service for a company or other
          organisation, you agree to them on its behalf and confirm you are
          allowed to do so. If you do not agree, do not use the service.
        </>
      }
    >
      <LegalSummary
        id="short-version"
        title="The short version"
        items={[
          <>
            The scheduler is free. It is provided as is, and you use it entirely
            at your own risk.
          </>,
          <>
            We are not liable to you for anything that happens because you used
            it. That includes an account, a page, a login or data that is
            leaked, hacked, lost, restricted, suspended or banned, and any
            money, reach or business you lose. The only exceptions are the ones
            the law does not let anybody exclude, set out in section 14.
          </>,
          <>
            We host a scheduling tool. We are not your publisher, your agent or
            your social media manager, and we do not review what you post.
          </>,
          <>
            Your social accounts and your posts are your responsibility. If a
            network limits, suspends or bans your account, cuts your reach, or
            changes its rules or its API, that is between you and the network.
            We are not liable for it.
          </>,
          <>
            We do not guarantee that a post will publish on time, or at all.
            Check important posts yourself, and never rely on Studio alone for
            anything time critical.
          </>,
          <>
            Everything done through your workspace counts as done by you. That
            includes team members, API keys, webhooks, MCP connections and any
            AI agent you let in.
          </>,
          <>
            Studio is community hosted. There is no service level and no support
            commitment, and we fix things at our own pace.
          </>,
          <>
            The free plan, its features and its limits, including the 2 GB media
            cap, can change or end at any time. Keep your own copies of your
            content.
          </>,
          <>Studio is for businesses and professionals, not for consumers.</>,
          <>
            If you need a provider that accepts liability or promises a service
            level, use a paid service that sells one, and insure your business.
            Studio is free because it carries none of that.
          </>,
        ]}
      >
        This summary is part of these terms. The numbered sections below set out
        the detail and apply in full.
      </LegalSummary>

      <LegalSection id="about" title="1. About us">
        <p>
          Voholabs Studio is provided by Voholabs Ltd, a company registered in
          England and Wales with company number 17214002, whose registered
          office is at 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ,
          United Kingdom. In these terms &quot;we&quot;, &quot;us&quot;
          and &quot;Voholabs&quot; mean that company. You can contact us at{' '}
          <Mail />.
        </p>
      </LegalSection>

      <LegalSection id="business-use" title="2. Business use only">
        <p>
          Voholabs Studio is offered only to businesses and professionals. By
          using it you confirm that you are using it wholly or mainly for
          purposes relating to your trade, business, craft or profession, and
          not as a consumer. We offer the service free, and on these terms,
          because you give us that confirmation.
        </p>
        <p>
          You must be at least 18 years old, or the minimum age required by the
          platforms you connect, whichever is higher.
        </p>
        <p>
          If, despite your confirmation, the law treats you as a consumer, this
          paragraph applies instead of paragraphs 14.2 to 14.11. We will provide
          the service with reasonable care and skill. If we fail to, we are
          responsible for loss or damage you suffer that was a foreseeable
          result of that failure. We are not responsible for business losses,
          because the service is not offered for personal use, or for loss that
          was not foreseeable, that you could have avoided by following section
          8 or keeping your own copies, or that was caused by a platform or by
          anyone acting through your workspace. Nothing in these terms affects
          your legal rights as a consumer. You can bring a claim in the courts
          of the part of the United Kingdom, or the country, where you live.
        </p>
      </LegalSection>

      <LegalSection id="free-plan" title="3. The service and the free plan">
        <p>
          Voholabs Studio lets you connect social media accounts, compose posts,
          schedule them to publish at chosen times, manage a shared media
          library, work with team members, connect the API, webhooks or an AI
          assistant, and view analytics for the content you published through
          the service.
        </p>
        <p>
          Scheduling is free. The free plan has no set limit on connected
          channels or scheduled posts, and includes the calendar, team members,
          up to 30 webhooks, the public API and the MCP connection for AI
          assistants. We do not ask for a card. In return we ask every new
          account a few questions, and we may contact you about Voholabs
          services, as the{' '}
          <a className="underline" href="/privacy">
            Privacy Policy
          </a>{' '}
          explains.
        </p>
        <LegalList
          items={[
            <>
              <strong>Storage.</strong> Each organisation can keep up to 2 GB in
              its media library. When you reach the cap, new uploads are refused
              until you delete files. If you need more, email us. We may say no.
            </>,
            <>
              <strong>Fair use.</strong> &quot;No set limit&quot; means we do
              not count your channels or posts. It does not mean unlimited load.
              We apply rate limits to the API and the MCP connection, each
              social network applies its own posting limits, and we may restrict
              an account whose usage degrades the service for others.
            </>,
            <>
              <strong>Networks.</strong> Which social networks can be connected
              depends on the approvals each network has given us, and can change
              without notice.
            </>,
            <>
              <strong>Community hosted.</strong> The free plan comes with no
              service level, no uptime commitment, no backup commitment and no
              support commitment. We fix problems at our own pace. You can
              report a problem by email or on the public repository, but we do
              not promise a reply or a fix by any particular time, or at all.
            </>,
            <>
              <strong>It can change or end.</strong> We may change, limit,
              suspend or withdraw the free plan, or any feature or limit in it,
              at any time and for any reason. If we withdraw the plan altogether
              we will try to give account holders 30 days&apos; notice by email
              so you can copy your content out first, but we do not promise to,
              and we are not liable if we cannot.
            </>,
            <>
              <strong>Keep your own copies.</strong> Studio is not a backup or
              an archive. Keep your own copy of every post and every media file
              you put into it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="paid" title="4. Paid features, wallet credits and Apex">
        <p>
          AI features (writing, image and video generation and the agent) are
          not part of the free plan. They are available only as part of Apex,
          the managed content service we sell at voholabs.com. Some other
          features are paid from a prepaid wallet of credits, described below.
        </p>
        <p>
          <strong>Wallet credits.</strong> Some features, such as posting to
          certain channels, storage above the free allowance, the brief
          onboarding and skills, are paid from a prepaid wallet. You buy
          credits by card through Stripe. The price of each paid action is
          shown in Studio on the Prices page. We may change prices; a change
          applies only to use after it.
        </p>
        <LegalList
          items={[
            <>
              <strong>Credits are never refunded.</strong> Credits are
              prepaid and non-refundable, in whole or in part, for any reason,
              including if you stop using Studio, close your account, your
              account is suspended or ended, or a feature or price changes,
              except where the law requires otherwise.
            </>,
            <>
              <strong>Credits expire after a year without activity.</strong>{' '}
              If there is no activity in your wallet for 12 months in a row (no
              top-up and no credits spent), the remaining balance expires and
              is removed.
            </>,
            <>
              <strong>Credits have no cash value.</strong> They can only be
              used in Studio, by the organisation that bought them, and cannot
              be sold or transferred.
            </>,
            <>
              <strong>Usage already used is still owed.</strong> Some usage,
              such as storage or channel analytics, can take your balance below
              zero. You must top up to cover it before using paid features
              again.
            </>,
            <>
              <strong>Refunded or disputed payments.</strong> If a card payment
              is refunded or disputed, we remove the credits it bought and may
              put the wallet on hold.
            </>,
            <>
              <strong>Auto top-up.</strong> If you turn it on, you authorise us
              to charge your saved card the amount you chose whenever your
              balance falls below your threshold, up to the monthly limit you
              set, until you turn it off.
            </>,
          ]}
        />
        <p>
          Apex is ordered, billed and cancelled through voholabs.com, with
          payment taken by Stripe. Apex fees, renewal, cancellation and refunds
          are governed by the{' '}
          <Ext href="https://voholabs.com/terms">Voholabs Terms of Service</Ext>{' '}
          and the{' '}
          <Ext href="https://voholabs.com/refund-policy">Refund Policy</Ext>,
          not by this page. These Studio terms continue to govern your use of
          Voholabs Studio itself. If an Apex subscription ends, your Studio
          organisation returns to the free plan and its limits, including the 2
          GB storage cap.
        </p>
        <p>
          Paying for Apex does not create a service level, an uptime commitment
          or a support commitment for the scheduler, unless we have agreed one
          with you in a signed written order. AI output can be wrong, offensive,
          infringing or unsuitable. You are responsible for checking it before
          it is published.
        </p>
      </LegalSection>

      <LegalSection
        id="account"
        title="5. Your account and everyone who acts through it"
      >
        <LegalList
          items={[
            <>
              You can sign up with Google, or with a work email address and a
              password. You must give accurate details, including in the
              questions we ask every new account, and keep them up to date.
            </>,
            <>
              You are responsible for keeping your password, API keys, webhook
              addresses and AI assistant connections secret and secure.
            </>,
            <>
              Anything done in your workspace, or with your API key, or through
              a webhook, an MCP connection or an AI assistant you connected, is
              treated as done by you. That includes posts that a person, a
              script or an assistant writes, schedules, edits, deletes or
              publishes, even if it misunderstood you, acted without asking, or
              acted after you thought its access had ended.
            </>,
            <>
              If you add team members, you are responsible for what they do, for
              removing their access when they leave, and for telling them how
              their data is handled.
            </>,
            <>
              An AI assistant or other tool you connect can read data in your
              organisation, including channel names, posts, media and analytics.
              That data is then handled by the provider of that tool under its
              terms, not ours. Only connect tools you trust. If you want a human
              check before anything goes out, have the assistant create drafts
              and publish them yourself.
            </>,
            <>
              If you think a key, a password or a connection has leaked, rotate
              your API key in settings, change your password, remove the
              connection, and tell us. We may rate-limit, suspend or revoke API
              keys and connections to protect the service or a connected
              platform.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection
        id="channels"
        title="6. Connected channels and other platforms"
      >
        <p>
          Connecting a channel authorises Voholabs Studio to act on that
          platform, strictly within the permissions you granted and only to
          carry out what you or your workspace instruct. You confirm that you
          own or are authorised to manage every account you connect.
        </p>
        <p>
          <strong>The risk to your social accounts is yours.</strong> Each
          network decides for itself whether to rate-limit, restrict, label,
          reduce the reach of, suspend or ban an account, or to remove content.
          It may do so because of automation, posting volume, the content, a
          change in its rules, or for no stated reason. Using a scheduling tool
          does not protect you from that and may be a factor in it. We have no
          say in those decisions and cannot reverse them.
        </p>
        <p>
          <strong>Our own access can be taken away.</strong> We connect to each
          network through developer access that the network has approved and can
          limit, suspend or withdraw at any time. If that happens, every user of
          that network may be disconnected at once, without notice, and
          scheduled posts for it will not publish.
        </p>
        <p>
          Your use of each connected platform remains subject to that
          platform&apos;s own terms and policies, and you are responsible for
          complying with them. In particular:
        </p>
        <LegalList
          items={[
            <>
              Where you connect a <strong>TikTok</strong> account, TikTok&apos;s
              Terms of Service, Community Guidelines and Privacy Policy apply.
            </>,
            <>
              Where you connect a <strong>YouTube</strong> channel, you agree to
              be bound by the{' '}
              <Ext href="https://www.youtube.com/t/terms">
                YouTube Terms of Service
              </Ext>
              . Voholabs Studio uses the YouTube API Services, and Google&apos;s
              handling of your data is described in the{' '}
              <Ext href="https://policies.google.com/privacy">
                Google Privacy Policy
              </Ext>
              . You can revoke our access to your Google data at any time from
              the{' '}
              <Ext href="https://security.google.com/settings/security/permissions">
                Google security settings page
              </Ext>
              .
            </>,
            <>
              Where you connect a <strong>Facebook</strong> Page,{' '}
              <strong>Instagram</strong> professional account or{' '}
              <strong>Threads</strong> profile, Meta&apos;s Terms of Service,
              Community Standards and{' '}
              <Ext href="https://www.facebook.com/privacy/policy/">
                Privacy Policy
              </Ext>{' '}
              apply.
            </>,
            <>
              Where you connect a <strong>LinkedIn</strong> profile or page, the
              LinkedIn User Agreement and Professional Community Policies apply.
              Where you connect an <strong>X</strong> account, the X Terms of
              Service and X Rules apply, including the rules on automation.
            </>,
          ]}
        />
        <p>
          Voholabs Studio is an independent product. It is not endorsed by,
          affiliated with, or sponsored by TikTok, Google, YouTube, Meta
          Platforms, Inc., LinkedIn, X Corp. or any other platform, and platform
          names and logos are the trade marks of their respective owners.
        </p>
      </LegalSection>

      <LegalSection id="content" title="7. Your content">
        <p>
          You keep ownership of everything you upload or schedule. You grant us
          a non-exclusive, worldwide, royalty-free licence to host, store, copy,
          process, transform (for example resizing or re-encoding media) and
          transmit that content, only as needed to operate the service and
          publish it to the channels you selected. The licence ends when the
          content is erased from our systems.
        </p>
        <p>
          You are the publisher of everything that goes out through your
          workspace. We provide the tool that carries out your instructions. We
          do not write, select, check, approve or review content before it is
          published, and we are under no duty to monitor it.
        </p>
        <p>
          You are responsible for your content: that you hold the rights to it,
          that it is lawful, accurate and not defamatory, that it respects other
          people&apos;s privacy and confidentiality, that it is properly
          labelled where a platform or the law requires a label (for example
          advertising, paid partnerships or AI-generated media), and that it
          complies with the rules of every platform you publish it to. If you
          work in a regulated field, such as financial services, health, legal
          services, gambling or alcohol, compliance with the rules on what you
          may say and when is yours alone. Nothing in the service is legal,
          financial or other professional advice.
        </p>
      </LegalSection>

      <LegalSection id="reliability" title="8. Scheduled posts can fail">
        <p>
          Publishing depends on our systems, on each platform&apos;s API and on
          the state of your connected account, so we do not promise that any
          post goes out, or goes out on time. A scheduled post may fail, be
          delayed, publish more than once, publish at the wrong time (including
          because of a time zone or queue fault), publish to the wrong channel,
          publish with missing or wrong media or formatting, or publish after
          you edited, unscheduled or deleted it. A draft may be published if it
          is scheduled by you, a team member or a connected tool. Causes include
          a platform being down or changing its API, an expired token, a
          platform rejecting the content, and faults or maintenance in our own
          service.
        </p>
        <p>
          You are responsible for checking that important posts were published
          as you intended. Do not rely on Voholabs Studio as the only means of
          publishing anything that is time critical, legally required or
          regulated, such as a market announcement, a safety notice or a
          statutory disclosure.
        </p>
      </LegalSection>

      <LegalSection id="aup" title="9. Acceptable use">
        <p>
          You must not use Voholabs Studio, directly or through automation, to:
        </p>
        <LegalList
          items={[
            <>
              publish content that is unlawful, defamatory, fraudulent,
              deceptive, harassing, threatening or hateful, that promotes
              violence or terrorism, that sexualises children, or that shares
              intimate images without consent;
            </>,
            <>
              infringe anyone&apos;s copyright, trade mark, privacy,
              confidentiality or other rights;
            </>,
            <>
              impersonate a person, brand or organisation, or misrepresent who
              is behind an account;
            </>,
            <>
              run scams, phishing, fake giveaways, unlawful financial promotions
              or undisclosed advertising;
            </>,
            <>
              send spam, post duplicate or near-duplicate content across many
              accounts, create or operate fake, bulk or inauthentic accounts or
              coordinated networks of them, or artificially inflate engagement;
            </>,
            <>
              get around a platform&apos;s rules, rate limits, automation
              policy, suspension or ban, or use the service for an account that
              a platform has banned;
            </>,
            <>
              access accounts you are not authorised to manage, or scrape,
              resell or build databases from platform data obtained through the
              service;
            </>,
            <>
              get around our rate limits or storage limits (for example by
              opening several organisations to avoid the storage cap), or use
              the media library as general file hosting;
            </>,
            <>
              upload malware, or content that is illegal to possess or
              distribute;
            </>,
            <>
              probe, attack, overload or reverse engineer the hosted service, or
              interfere with its security or availability. This does not limit
              what the open-source licence in section 16 lets you do with the
              source code.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection
        id="takedown"
        title="10. Reports, takedown and repeat infringers"
      >
        <p>
          If you believe something stored or published through Voholabs Studio
          infringes your rights or is unlawful, email <Mail /> with the subject{' '}
          <em>Takedown</em>. Tell us who you are, what the content is and where
          it is (a link), which right or law you say it breaches, and confirm
          that what you tell us is accurate. For content already published on a
          social network, the fastest route is that network&apos;s own reporting
          tool, because only the network can remove it there.
        </p>
        <p>
          When we are told about content in this way we will look at the report
          and, where we think it is justified, remove or disable the content we
          hold and may cancel scheduled posts. We may tell the user concerned,
          who can reply to us. We close the accounts of users who infringe
          repeatedly.
        </p>
        <p>
          We may report suspected illegal activity to the relevant platform or
          to the authorities, and we will disclose account information where the
          law requires us to.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="11. Suspension and ending">
        <p>
          <strong>By us.</strong> We may remove content, cancel or pause
          scheduled posts, disconnect a channel, revoke keys and connections,
          and suspend or close an account, immediately and without notice, if we
          reasonably believe these terms have been breached, if a platform or
          the law requires it, if it is needed to protect the service, another
          user or our access to a platform, or if we withdraw the service under
          section 3. We may also close an account that has not been used for 12
          months, after emailing a warning to the registered address at least 30
          days before. We are not liable to you for taking any of these steps.
          Where we reasonably can, we will tell you why.
        </p>
        <p>
          <strong>By you.</strong> You can stop using the service at any time.
          There is currently no button that deletes a whole account. To close
          yours, email <Mail /> from the address registered on the account with
          the subject <em>Delete my account</em>. We erase the account and its
          data within 30 days of verifying the request, as set out in the{' '}
          <a className="underline" href="/privacy#data-deletion">
            data deletion section of the Privacy Policy
          </a>
          .
        </p>
        <p>
          <strong>Your data when an account ends.</strong> We erase your
          account, onboarding answers, posts, media and connected channels from
          our live systems. Copies may remain in backups for a limited time
          until they are overwritten. We keep what the law requires us to keep,
          and a record of the request. Content already published to a social
          network stays on that network. You can copy your posts and media out
          through the app or the API while your account is open. We do not
          provide an export after an account is closed, so take what you need
          first.
        </p>
        <p>
          Sections 2, 5, 7, 11 to 18, 20 and 21 continue to apply after your
          account ends.
        </p>
      </LegalSection>

      <LegalSection id="security" title="12. Security">
        <p>
          We take reasonable technical and organisational measures to protect
          the service and the tokens and content it holds. No online service is
          completely secure, and we do not guarantee that the service, or the
          data in it, will never be accessed, lost or altered without authority.
          You are responsible for your own passwords, devices, API keys,
          webhooks and connected tools.
        </p>
        <p>
          You can take away our access to a connected account at any time, at
          the platform itself, whatever state Studio is in:
        </p>
        <LegalList
          items={[
            <>
              <strong>Google and YouTube:</strong> the{' '}
              <Ext href="https://security.google.com/settings/security/permissions">
                Google security settings page
              </Ext>
              .
            </>,
            <>
              <strong>Facebook, Instagram and Threads:</strong>{' '}
              <Ext href="https://www.facebook.com/settings?tab=business_tools">
                Facebook Settings, Business Integrations
              </Ext>
              , and the apps and websites settings in Instagram and Threads.
            </>,
            <>
              <strong>TikTok:</strong> Settings and privacy, then Security and
              permissions, then Manage app permissions, in the TikTok app.
            </>,
            <>
              <strong>LinkedIn:</strong> Settings, then Data privacy, then{' '}
              <Ext href="https://www.linkedin.com/psettings/permitted-services">
                Permitted services
              </Ext>
              .
            </>,
            <>
              <strong>X:</strong> Settings, then Security and account access,
              then{' '}
              <Ext href="https://x.com/settings/connected_apps">
                Connected apps
              </Ext>
              .
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="warranties" title="13. No warranties">
        <p>
          The service is provided as is and as available. We do not promise that
          it will be uninterrupted, timely, secure or free of errors, that it
          will meet your needs, that data in it will be kept or backed up, or
          that it will keep working with any platform. As far as the law allows,
          we exclude all conditions, warranties and other terms that might
          otherwise be implied by statute, common law or custom. Descriptions of
          the service on our websites, in articles and in comparisons are
          general information, not promises about what it will do for you.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="14. We are not liable to you">
        <p>
          <strong>14.1 The only exceptions.</strong> Nothing in these terms
          excludes or limits our liability for death or personal injury caused
          by our negligence, for our fraud or fraudulent misrepresentation, or
          for any liability that the law does not allow anybody to exclude or
          limit. Everything else in this section is subject to this paragraph
          and to section 2. These and section 2 are the only exceptions to this
          section.
        </p>
        <p>
          <strong>14.2 No liability.</strong> We are not liable to you for any
          loss or damage of any kind, however it is caused, that arises out of
          or in connection with the service or these terms. You use the service
          entirely at your own risk.
        </p>
        <p>
          <strong>14.3 Leaks, hacks and security.</strong> We are not liable for
          any loss arising from unauthorised access to, or the leak, disclosure,
          theft, loss, alteration or misuse of, your Studio account, your
          connected social accounts and pages, your passwords, API keys and
          access tokens, your content, your media or your data, whether that
          happens through an attack on the service, a failure of our security,
          a mistake by us, a provider we rely on, or anything on your side.
        </p>
        <p>
          <strong>14.4 Your social accounts and other platforms.</strong> We are
          not liable for any loss arising from a platform rate-limiting,
          restricting, labelling, reducing the reach of, suspending, banning or
          closing any account, page, channel, profile or advertising account, or
          removing any content; from the loss of followers, reach, engagement,
          monetisation or access on any platform; from a platform changing,
          limiting, breaking or withdrawing its API, its rules or its service;
          from a platform outage; or from our own access to a platform being
          limited, suspended or withdrawn.
        </p>
        <p>
          <strong>14.5 Publishing.</strong> We are not liable for any loss
          arising from a post that fails, is delayed, is published more than
          once, at the wrong time, to the wrong channel, with missing or wrong
          media or formatting, or after it was edited, unscheduled or deleted.
        </p>
        <p>
          <strong>14.6 People and tools acting through your workspace.</strong>{' '}
          We are not liable for any loss arising from anything done by a team
          member, a former team member, or anyone or anything using your
          password, API key, webhook, MCP connection or connected AI assistant,
          script or third-party tool, or from what the provider of such a tool
          does with data it obtains.
        </p>
        <p>
          <strong>14.7 Availability and data.</strong> We are not liable for any
          loss arising from the service being unavailable, slow, changed,
          limited or withdrawn, from uploads being refused at the storage cap,
          from an account being suspended or closed under section 11, or from
          the loss, corruption or deletion of content or data held in the
          service.
        </p>
        <p>
          <strong>14.8 Types of loss.</strong> We are not liable, whether the
          loss is direct or indirect, for loss of profit; loss of revenue or
          sales; loss of business, contracts or opportunity; loss of anticipated
          savings; loss of goodwill or reputation; wasted staff or management
          time; fines or penalties imposed on you; claims made against you by
          anybody else; or any indirect or consequential loss.
        </p>
        <p>
          <strong>14.9 Events outside our control.</strong> We are not liable
          for a failure or delay caused by something outside our reasonable
          control, including failures of hosting, storage, email, network or
          platform providers, attacks on the service, and acts of government.
        </p>
        <p>
          <strong>14.10 Overall cap.</strong> If we are liable to you for any
          reason, our total liability to you for all claims arising out of or in
          connection with these terms and the service, added together, is
          limited to the greater of (a) the amounts you paid us for Voholabs
          Studio in the 12 months before the first event that gave rise to a
          claim and (b) £100. This paragraph stands by itself and applies
          whether or not any other paragraph of this section applies.
        </p>
        <p>
          <strong>14.11 Time limit.</strong> You must start any claim against us
          within 12 months of the date you first knew, or ought reasonably to
          have known, of the facts that give rise to it. After that the claim is
          barred.
        </p>
        <p>
          <strong>14.12 How this section works.</strong> Paragraphs 14.2 to
          14.11 apply to liability of every kind, whether in contract, tort
          (including negligence), breach of statutory duty, misrepresentation or
          otherwise, and to us, our directors, staff and contractors. Each
          paragraph, and each item within it, is a separate term. If a court
          finds one of them unenforceable, the others continue to apply.
        </p>
        <p>
          <strong>14.13 Why this is fair.</strong> We charge nothing for the
          service, and we could not offer it on that basis if we carried the
          risks of your business. You are told this plainly on the sign-up
          screen, before you can create an account, and in the summary at the
          top of these terms. Most of these risks are in your hands: you can
          check that posts went out, keep copies of your content, control who
          and what has access to your workspace and your social accounts, revoke
          our access at the platform at any time, use two-factor authentication,
          and insure your business. If you need service levels, support or
          contractual remedies, paid services offer them and you are free to use
          one. You accept that this section is reasonable on that basis.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" title="15. Claims caused by your use">
        <p>
          You will indemnify us against all losses, damages, fines, costs and
          expenses (including reasonable legal fees) that we incur because of a
          claim, complaint, demand or enforcement action by a third party,
          including a platform or a regulator, that arises from: content stored
          or published through your workspace; an account you connected;
          anything done by a person or tool acting through your workspace; your
          breach of section 9 or of a platform&apos;s rules; or personal data
          you put into the service without a lawful basis.
        </p>
        <p>
          We will tell you about the claim promptly, let you comment on how it
          is handled, and take reasonable steps to keep the cost down. The
          limits in section 14 apply to our liability, not to yours under this
          section.
        </p>
      </LegalSection>

      <LegalSection id="open-source" title="16. Open source">
        <p>
          Voholabs Studio is built on open-source software licensed under the
          GNU Affero General Public License, version 3 (AGPL-3.0). The complete
          source code of the version running at studio.voholabs.com, including
          our modifications and the copyright and licence notices of the
          original authors, is available free of charge at{' '}
          <Ext href="https://github.com/voholabs/voholabs-studio">
            github.com/voholabs/voholabs-studio
          </Ext>
          .
        </p>
        <p>
          The AGPL-3.0 governs your rights in the source code, and nothing in
          these terms limits those rights. The code is provided under that
          licence without warranty of any kind, as the licence itself states. If
          you run the software yourself, you do so under the licence and at your
          own risk: we do not host, support or answer for any copy of it other
          than the service at studio.voholabs.com. These terms govern only your
          use of the hosted service we run. Contributions to the source code are
          made under the terms stated in the repository.
        </p>
      </LegalSection>

      <LegalSection id="data" title="17. Personal data you put into Studio">
        <p>
          Our{' '}
          <a className="underline" href="/privacy">
            Privacy Policy
          </a>{' '}
          explains how we handle your own account data as a controller. Where
          the content, media or team member details you put into Studio include
          personal data about other people, you are the controller of that data
          and we process it for you as a processor. For that processing we agree
          that we will:
        </p>
        <LegalList
          items={[
            <>
              process it only on your documented instructions, which are these
              terms and what you do in the service, unless the law requires
              otherwise;
            </>,
            <>
              keep it confidential and make sure everyone we authorise to handle
              it is bound to do the same;
            </>,
            <>
              apply appropriate technical and organisational security measures;
            </>,
            <>
              use the sub-processors listed in the Privacy Policy under written
              terms that protect the data to the same standard, tell you before
              we add or replace one by updating that list, and remain
              responsible for them;
            </>,
            <>
              help you, as far as is reasonable, to respond to requests from
              individuals and to meet your own security, breach notification and
              impact assessment duties, and tell you without undue delay if we
              become aware of a personal data breach affecting your data;
            </>,
            <>
              delete the data when your account is closed, as described in the
              Privacy Policy, unless the law requires us to keep it; and
            </>,
            <>
              give you the information reasonably needed to show we meet these
              obligations.
            </>,
          ]}
        />
        <p>
          You confirm that you have a lawful basis, and any notices or consents
          needed, to put that data into Studio and to publish it.
        </p>
      </LegalSection>

      <LegalSection id="feedback" title="18. Feedback">
        <p>
          If you send us ideas or suggestions about the service, we may use them
          without restriction or payment.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="19. Changes to these terms">
        <p>
          We may update these terms. The date at the top of this page shows when
          they last changed. We will email account holders about any material
          change at least 14 days before it takes effect, unless the change is
          needed sooner for legal or security reasons or to reflect a change
          made by a platform. If you keep using the service after a change takes
          effect, you accept the updated terms. If you do not accept them, stop
          using the service and ask us to close your account.
        </p>
      </LegalSection>

      <LegalSection id="general" title="20. General">
        <LegalList
          items={[
            <>
              <strong>Governing law and courts.</strong> These terms, and any
              dispute or claim arising out of them or the service (including
              non-contractual disputes), are governed by the law of England and
              Wales, and the courts of England and Wales have exclusive
              jurisdiction.
            </>,
            <>
              <strong>Whole agreement.</strong> These terms and the Privacy
              Policy are the whole agreement between you and us about Voholabs
              Studio. You confirm that you have not relied on any statement,
              promise or description that is not set out in them. Nothing in
              this paragraph limits liability for fraud.
            </>,
            <>
              <strong>Severability.</strong> If a court finds any part of these
              terms invalid or unenforceable, that part is removed to the
              smallest extent needed and the rest continues to apply.
            </>,
            <>
              <strong>No waiver.</strong> If we do not enforce a right, or delay
              in doing so, we have not given that right up.
            </>,
            <>
              <strong>Transfer.</strong> We may transfer our rights and
              obligations under these terms to another organisation, for example
              if the service is sold. You may not transfer yours without our
              written agreement.
            </>,
            <>
              <strong>No third-party rights.</strong> Our directors, staff and
              contractors may rely on section 14 and section 15. Apart from
              that, nobody other than you and us has any right to enforce these
              terms under the Contracts (Rights of Third Parties) Act 1999. We
              and you can change or end these terms without their consent.
            </>,
            <>
              <strong>No partnership or agency.</strong> Nothing in these terms
              makes either of us the partner, agent or employee of the other.
            </>,
            <>
              <strong>Notices.</strong> We send notices to the email address
              registered on your account. Send notices to us at the address in
              section 21.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="contact" title="21. Contact">
        <p>
          Voholabs Ltd, 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ,
          United Kingdom. Email: <Mail />. For
          takedown requests use the subject <em>Takedown</em>. For account
          deletion use the subject <em>Delete my account</em>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
