import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  BRIEF_ASSET_NAME_MAX,
  BRIEF_ASSET_NOTE_MAX,
  BRIEF_ASSET_URL_MAX,
  BRIEF_ASSETS_MAX,
  BRIEF_BLOCK_ID_MAX,
  BRIEF_BLOCKS_MAX,
  BRIEF_BODY_MAX,
  BRIEF_HEADING_MAX,
  BRIEF_LINK_ID_MAX,
  BRIEF_LINK_NOTE_MAX,
  BRIEF_LINK_URL_MAX,
  BRIEF_LINKS_MAX,
  BRIEF_TITLE_MAX,
} from '@gitroom/nestjs-libraries/agent-brief/brief.registry';

export class BriefBlockDto {
  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_BLOCK_ID_MAX)
  id: string;

  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_HEADING_MAX)
  heading: string;

  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_BODY_MAX)
  body: string;
}

export class BriefLinkDto {
  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_LINK_ID_MAX)
  id: string;

  // Length-capped but not format-checked: autosave fires while the user is
  // still halfway through typing a URL, and rejecting that would lose the
  // keystrokes. Nothing fetches these links, they are read as text.
  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_LINK_URL_MAX)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(BRIEF_LINK_NOTE_MAX)
  note?: string;
}

export class BriefAssetDto {
  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_BLOCK_ID_MAX)
  id: string;

  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_ASSET_NAME_MAX)
  name: string;

  @IsString()
  @IsDefined()
  @MaxLength(BRIEF_ASSET_URL_MAX)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BRIEF_ASSET_NOTE_MAX)
  note?: string;
}

// Blocks and links are ordered lists, so each is replaced whole rather than
// merged; a field that is absent is left exactly as it was stored.
export class SaveBriefDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(BRIEF_TITLE_MAX)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BRIEF_BLOCKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => BriefBlockDto)
  blocks?: BriefBlockDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BRIEF_LINKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => BriefLinkDto)
  links?: BriefLinkDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BRIEF_ASSETS_MAX)
  @ValidateNested({ each: true })
  @Type(() => BriefAssetDto)
  assets?: BriefAssetDto[];
}

export class StartBriefOnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;
}
