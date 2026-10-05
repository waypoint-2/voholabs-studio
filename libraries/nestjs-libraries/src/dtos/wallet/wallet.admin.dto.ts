import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

// Credits are in hundredths (225 = 2.25 credits), like everywhere else.
export class WalletGrantDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsInt()
  @Min(1)
  @Max(100000000)
  credits: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  // Makes a retried request safe: the same key for the same workspace
  // returns the first entry instead of adding another.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  idempotencyKey?: string;

  // Also starts pay-as-you-go, as a first top-up would.
  @IsBoolean()
  @IsOptional()
  unlock?: boolean;
}

export class WalletAdjustDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  // Positive adds, negative takes away (the balance may go below zero).
  @IsInt()
  @NotEquals(0)
  @Min(-100000000)
  @Max(100000000)
  credits: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  // Makes a retried request safe: the same key for the same workspace
  // returns the first entry instead of adding another.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class WalletUnfreezeDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
