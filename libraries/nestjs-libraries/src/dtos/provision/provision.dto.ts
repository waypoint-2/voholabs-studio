import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ProvisionLookupDto {
  @IsEmail()
  @IsDefined()
  email: string;
}

export class ProvisionAccessDto {
  @IsString()
  @IsDefined()
  orgId: string;

  @IsOptional()
  @IsISO8601()
  activeUntil?: string;

  @IsOptional()
  @IsBoolean()
  revoke?: boolean;
}

export class ProvisionSessionDto {
  @IsString()
  @IsDefined()
  orgId: string;
}

export class ProvisionOnboardingFinishDto {
  @IsString()
  @IsDefined()
  orgId: string;

  @IsIn(['DONE', 'FAILED'])
  @IsDefined()
  status: 'DONE' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
