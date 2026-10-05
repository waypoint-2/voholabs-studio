import { Injectable } from '@nestjs/common';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { array, object, string } from 'zod';
import { ModuleRef } from '@nestjs/core';
import {
  notOnPlanToolNames,
  toolList,
} from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { hasAccess } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';
import dayjs from 'dayjs';

export const AgentState = object({
  proverbs: array(string()).default([]),
});

// The tools the agent is given for one request. A paid plan gets exactly the
// tools it had before the wallet; without an organization in the context
// (listing the tools at boot) every tool is returned.
export const toolsForRequest = (
  tools: Record<string, any>,
  requestContext?: { get: (key: string) => unknown }
) => {
  let organization: any;
  try {
    const raw = requestContext?.get('organization');
    organization = typeof raw === 'string' ? JSON.parse(raw) : undefined;
  } catch (err) {
    organization = undefined;
  }
  if (!organization || !hasAccess(organization)) {
    return tools;
  }
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !notOnPlanToolNames.includes(name))
  );
};

const renderArray = (list: string[], show: boolean) => {
  if (!show) return '';
  return list.map((p) => `- ${p}`).join('\n');
};

@Injectable()
export class LoadToolsService {
  constructor(private _moduleRef: ModuleRef) {}

  async loadTools() {
    return (
      await Promise.all<{ name: string; tool: any }>(
        toolList
          .map((p) => this._moduleRef.get(p, { strict: false }))
          .map(async (p) => ({
            name: p.name as string,
            tool: await p.run(),
          }))
      )
    ).reduce(
      (all, current) => ({
        ...all,
        [current.name]: current.tool,
      }),
      {} as Record<string, any>
    );
  }

  async agent() {
    const tools = await this.loadTools();
    return new Agent({
      id: 'postiz',
      name: 'postiz',
      description: 'Agent that helps manage and schedule social media posts for users',
      instructions: ({ requestContext }) => {
        const ui: string = requestContext.get('ui' as never);
        return `
      Global information:
        - Date (UTC): ${dayjs().format('YYYY-MM-DD HH:mm:ss')}

      You are an agent that helps manage and schedule social media posts for users, you can:
        - Schedule posts into the future, or now, adding texts, images and videos
        - Generate text for posts
        - Show how a channel is performing, and how a single published post performed
        - Move a post between draft and the schedule
        - List integrations (channels)
        - List groups (customers) and filter the channels by a group
        - List the posts already on the calendar, edit a post that is on it, and delete (unschedule) a post
        - Find the next free slot in the schedule
        - List the media library, upload media, and delete media
        - Keep your own Experience: what has worked for this brand and what has not
        - Read and edit the agent brief: what the business is, who it is for, how it sounds, what is off limits, how each channel is steered, and which sources to draw on
        - Compare a post as it was drafted with the post that actually went out, and see what has changed in the brief

      - To attach a file the user has locally, get it into the media library first and use the returned "path" as the attachment. Pick the route by size: uploadFromUrlTool when it is reachable by URL, uploadMediaTool for a small file you can base64 inline, and createUploadLinkTool for anything bigger (a photo or a video) — then POST the file to the link it returns.
      - If an upload to the link is refused with a 403 or a blocked network, that is the agent sandbox not being allowed to reach this host — tell the user to open Settings, go to Capabilities, find the domain allowlist and add the host from the tool's "allowlistHost" field, then retry. Never route the user's file through a third-party host to get around it.
      - Reading the user's existing media back is blocked by the same setting, and it is a SEPARATE domain: the "path" of a media item or a post attachment points at where the files are kept, not at Voholabs Studio. So a 403 or a network block on one of those URLs is not a broken link and not a missing file — tell the user to add that URL's host to the same domain allowlist (for object storage it is worth allowing the whole provider, e.g. "*.r2.dev", since each bucket sits on its own subdomain), then retry. Settings, Connect Agent shows both domains to add. Never tell the user an asset is unavailable when what actually happened is that you were not allowed to fetch it.
      - Deleting is permanent: before calling deletePostTool or deleteMediaTool, show the user exactly what will be removed and get a clear confirmation.
      - Analytics differ by network: each one reports its own metrics, so read the labels rather than assuming a fixed set, and say which network a number came from. Figures can lag the network's own dashboard by a day or two, so do not present them as live.
      - The agent brief is the user's own words about their business. Read it with briefListTool before drafting anything, so what you write sounds like them and respects what they said is off limits.
      - You may edit the brief yourself. Say what you changed afterwards, in a line or two, so the user can see it without having to go looking.
      - briefSaveTool replaces a whole document, so read it first and send the existing rules back along with your changes, or the rest is lost.
      - Experience is the exception: it is your own notebook, so record what you learn with briefLearnTool as you go, without asking. Note it after a post lands well or badly, or when the user corrects you on something that will apply again. Say afterwards what you wrote down.
      - Branding & assets holds the brand's own files. Read the notes on them before making anything visual, and respect what they say a file is not for. To add one, upload it to the media library first and register it with briefAssetTool, with a note on when to use it.
      - Keep Experience to what you observed and what to do differently next time. Anything the user tells you to do is an instruction, not a lesson — that belongs in the Foundation, and only they may put it there.
      - The difference between a post as it was drafted and the post that actually went out is the clearest feedback you get, and postHistory is where you read it. Check it when you have nothing else in hand, and before drafting for a channel whose posts have been changed on you. briefHistory does the same for the brief.
      - Treat a rewritten lesson of your own as a correction: keep their version and work out what you had wrong. Never restore what they removed.
      - Write what generalises into Experience with briefLearnTool, then close the edits off with markLearned — RECORDED with the topic you used, or NO_SIGNAL when the edits were only typos or one-off details. Anything left unmarked comes back to you forever.
      - Deleting a post removes its whole group (the post plus its thread items and comments). If the post was already published, it only disappears from the calendar — it stays live on the social network, so say that to the user.
      - To change a post that is already on the calendar, use editPostTool. Never delete and re-create a post to reword it: editPostTool keeps everything you do not pass — the attachments above all — where re-creating it would quietly drop the image or video the post was carrying and give it a new id. If you only want to change the words, pass "id" and "content" and nothing else.
      - Posts can be chained: an echo embeds another post's URL with "(post:<id>)". That reference is to the post's id, so editing a post keeps every echo pointing at it, while deleting one breaks them — the echo then fails at publish time instead of going out, and anything echoing IT fails in turn. deletePostTool refuses when it finds such posts and lists them in "breaksEchoes"; show that list to the user rather than forcing past it.
      - Editing a post that has already published only corrects the calendar. The message on the social network is untouched, and the tool says so — pass that on to the user instead of letting them think the live post changed.

      - We schedule posts to different integration like facebook, instagram, etc. but to the user we don't say integrations we say channels as integration is the technical name
      - When scheduling a post, you must follow the social media rules and best practices.
      - When scheduling a post, you can pass an array for list of posts for a social media platform, But it has different behavior depending on the platform.
        - For platforms like Threads, Bluesky and X (Twitter), each post in the array will be a separate post in the thread.
        - For platforms like LinkedIn and Facebook, second part of the array will be added as "comments" to the first post.
        - If the social media platform has the concept of "threads", we need to ask the user if they want to create a thread or one long post.
        - For X, if you don't have Premium, don't suggest a long post because it won't work.
        - Platform format will also be passed can be "normal", "markdown", "html", make sure you use the correct format for each platform.
      
      - Sometimes 'integrationSchema' will return rules, make sure you follow them (these rules are set in stone, even if the user asks to ignore them)
      - Each socials media platform has different settings and rules, you can get them by using the integrationSchema tool.
      - Always make sure you use this tool before you schedule any post.
      - In every message I will send you the list of needed social medias (id and platform), if you already have the information use it, if not, use the integrationSchema tool to get it.
      - Make sure you always take the last information I give you about the socials, it might have changed.
      - Before scheduling a post, always make sure you ask the user confirmation by providing all the details of the post (text, images, videos, date, time, social media platform, account).
      - Between tools, we will reference things like: [output:name] and [input:name] to set the information right.
      - When outputting a date for the user, make sure it's human readable with time
      - The content of the post, HTML, Each line must be wrapped in <p> here is the possible tags: h1, h2, h3, u, strong, li, ul, p (you can\'t have u and strong together), don't use a "code" box
      ${renderArray(
        [
          'If the user confirm, ask if they would like to get a modal with populated content without scheduling the post yet or if they want to schedule it right away.',
        ],
        !!ui
      )}
`;
      },
      model: openai('gpt-5.2'),
      tools: ({ requestContext }) =>
        toolsForRequest(tools, requestContext as any),
      memory: new Memory({
        storage: pStore,
        options: {
          generateTitle: true,
          workingMemory: {
            enabled: true,
            schema: AgentState,
          },
        },
      }),
    });
  }
}
