import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
// Media generation is off. Commented rather than deleted so the reason stays
// next to the code and turning one back on is a one line change. See the
// matching block at the bottom of toolList.
// import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
// import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
// import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
// import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { AccountInfoTool } from '@gitroom/nestjs-libraries/chat/tools/account.info.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { GroupListTool } from '@gitroom/nestjs-libraries/chat/tools/group.list.tool';
import { UploadFromUrlTool } from '@gitroom/nestjs-libraries/chat/tools/upload.from.url.tool';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PostsDeleteTool } from '@gitroom/nestjs-libraries/chat/tools/posts.delete.tool';
import { PostsEditTool } from '@gitroom/nestjs-libraries/chat/tools/posts.edit.tool';
import { PostsReplaceAssetTool } from '@gitroom/nestjs-libraries/chat/tools/posts.replace.asset.tool';
import { FindSlotTool } from '@gitroom/nestjs-libraries/chat/tools/find.slot.tool';
import { MediaListTool } from '@gitroom/nestjs-libraries/chat/tools/media.list.tool';
import { MediaPreviewTool } from '@gitroom/nestjs-libraries/chat/tools/media.preview.tool';
import { MediaDeleteTool } from '@gitroom/nestjs-libraries/chat/tools/media.delete.tool';
import { MediaUploadTool } from '@gitroom/nestjs-libraries/chat/tools/media.upload.tool';
import { MediaUploadLinkTool } from '@gitroom/nestjs-libraries/chat/tools/media.upload.link.tool';
import { BriefListTool } from '@gitroom/nestjs-libraries/chat/tools/brief.list.tool';
import { BriefSaveTool } from '@gitroom/nestjs-libraries/chat/tools/brief.save.tool';
import { BriefDeleteTool } from '@gitroom/nestjs-libraries/chat/tools/brief.delete.tool';
import { BriefLearnTool } from '@gitroom/nestjs-libraries/chat/tools/brief.learn.tool';
import { BriefAssetTool } from '@gitroom/nestjs-libraries/chat/tools/brief.asset.tool';
import { AnalyticsChannelTool } from '@gitroom/nestjs-libraries/chat/tools/analytics.channel.tool';
import { AnalyticsPostTool } from '@gitroom/nestjs-libraries/chat/tools/analytics.post.tool';
import { PostsStatusTool } from '@gitroom/nestjs-libraries/chat/tools/posts.status.tool';
import { PostHistoryTool } from '@gitroom/nestjs-libraries/chat/tools/post.history.tool';
import { BriefHistoryTool } from '@gitroom/nestjs-libraries/chat/tools/brief.history.tool';
import { MarkLearnedTool } from '@gitroom/nestjs-libraries/chat/tools/mark.learned.tool';
import { SanityMcpListTool } from '@gitroom/nestjs-libraries/chat/tools/sanity.mcp.list.tool';
import { SanityMcpCallTool } from '@gitroom/nestjs-libraries/chat/tools/sanity.mcp.call.tool';
import { MediaMcpListTool } from '@gitroom/nestjs-libraries/chat/tools/media.mcp.list.tool';
import { MediaMcpCallTool } from '@gitroom/nestjs-libraries/chat/tools/media.mcp.call.tool';
import { WalletBalanceTool } from '@gitroom/nestjs-libraries/chat/tools/wallet.balance.tool';
import { WalletTransactionsTool } from '@gitroom/nestjs-libraries/chat/tools/wallet.transactions.tool';
import { WalletPricesTool } from '@gitroom/nestjs-libraries/chat/tools/wallet.prices.tool';
import { SkillsListTool } from '@gitroom/nestjs-libraries/chat/tools/skills.list.tool';
import { SkillGetTool } from '@gitroom/nestjs-libraries/chat/tools/skills.get.tool';

export const toolList = [
  AccountInfoTool,
  BriefListTool,
  BriefSaveTool,
  BriefDeleteTool,
  BriefLearnTool,
  BriefAssetTool,
  BriefHistoryTool,
  MarkLearnedTool,
  SkillsListTool,
  SkillGetTool,
  IntegrationListTool,
  GroupListTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  PostsListTool,
  PostsEditTool,
  PostsReplaceAssetTool,
  PostsDeleteTool,
  PostsStatusTool,
  PostHistoryTool,
  AnalyticsChannelTool,
  AnalyticsPostTool,
  FindSlotTool,
  MediaListTool,
  MediaPreviewTool,
  MediaDeleteTool,
  MediaUploadTool,
  MediaUploadLinkTool,
  // Sanity's own hosted MCP, proxied and allowlisted. Both register
  // unconditionally and explain themselves when no Sanity channel is
  // connected, because the tool map is built once at boot and cannot vary per
  // organization.
  SanityMcpListTool,
  SanityMcpCallTool,
  // AI media editing, proxied through the org's metered key on mcp-meter.
  // Register unconditionally for the same reason as Sanity's: the tool map is
  // built once at boot, so the tools explain themselves when the meter is not
  // configured instead of vanishing.
  MediaMcpListTool,
  MediaMcpCallTool,
  // The credit wallet. Listed to every plan: a paid plan is told it does not
  // use credits, a free one how to top up.
  WalletBalanceTool,
  WalletTransactionsTool,
  WalletPricesTool,
  // Media generation belongs to the vendor, so the agent does not get these:
  //   GenerateImageTool      - vendor's job
  //   GenerateVideoTool      - exposes no models on this account anyway
  //   GenerateVideoOptionsTool - returns {"video":[]}, which four workers blocked on
  //   VideoFunctionTool      - setup call for the above
  // GenerateVideoOptionsTool,
  // VideoFunctionTool,
  // GenerateVideoTool,
  // GenerateImageTool,
  UploadFromUrlTool,
];

// Not part of the free plan: the brief, the skills library, and AI media. The MCP leaves them out
// of what it lists to a free organization, so the free plan is a complete
// product on its own terms rather than one with locked doors in it. Each of
// these also refuses by itself (see paidOnly), for the routes that cannot pick
// what they list.
export const paidToolNames = [
  'briefListTool',
  'briefSaveTool',
  'briefDeleteTool',
  'briefLearnTool',
  'briefAssetTool',
  'briefHistory',
  'markLearned',
  'skillsList',
  'skillGet',
  'mediaMcpList',
  'mediaMcpCall',
];

// The paid tools a wallet top-up opens, when a price row opens the brief or
// the skills (WalletService.unlockedKeys). AI media generation is never among
// them. Each tool still refuses on its own when its own key is not open
// (paidOnly(context, feature, 'brief' | 'skills')).
export const walletToolNames = [
  'briefListTool',
  'briefSaveTool',
  'briefDeleteTool',
  'briefLearnTool',
  'briefAssetTool',
  'briefHistory',
  'markLearned',
  'skillsList',
  'skillGet',
];

// What a wallet top-up can open that walletToolNames serves.
export const walletToolKeys = ['brief', 'skills'];

// Not served to a paid plan, whose MCP lists exactly the tools it had before
// the wallet: the wallet tools (a paid plan never uses credits) and the
// skills library.
export const notOnPlanToolNames = [
  'walletBalance',
  'walletTransactions',
  'walletPrices',
  'skillsList',
  'skillGet',
];
