'use client';

import { useFireEvents, useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import React, { FC, useCallback, useState } from 'react';
import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import {
  OnboardingDto,
  onboardingHeardFrom,
  onboardingRoles,
  onboardingUseCases,
} from '@gitroom/nestjs-libraries/dtos/users/onboarding.dto';
import { isWorkEmail } from '@gitroom/nestjs-libraries/services/work.email';
import { stripSensitiveParams } from '@gitroom/helpers/utils/utm.saver';

type Inputs = {
  name: string;
  website: string;
  role: string;
  heardFrom: string;
  useCase: string;
};

const resolver = classValidatorResolver(OnboardingDto);

// What the browser saved on the first visit (see utm.saver). Storage can be
// blocked, and the answers matter more than where the visit came from.
const readAttribution = () => {
  try {
    return JSON.stringify({
      utm: JSON.parse(localStorage.getItem('utm') || '""') || '',
      landingUrl: stripSensitiveParams(
        localStorage.getItem('landingUrl') || ''
      ),
      referrer: stripSensitiveParams(localStorage.getItem('referrer') || ''),
    }).slice(0, 2000);
  } catch (err) {
    return '';
  }
};

const Options: FC<{
  label: string;
  options: readonly string[];
  value: string;
  error?: string;
  onChange: (value: string) => void;
}> = ({ label, options, value, error, onChange }) => (
  <div className="flex flex-col gap-[8px]">
    <div className="text-[14px]">{label}</div>
    <div className="flex flex-wrap gap-[8px]">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          onClick={() => onChange(option)}
          className={clsx(
            'h-[38px] px-[14px] rounded-[8px] border text-[14px] transition-colors',
            value === option
              ? 'bg-forth border-forth text-white'
              : 'bg-newBgColorInner border-newTableBorder text-textColor hover:border-forth'
          )}
        >
          {option}
        </button>
      ))}
    </div>
    {!!error && <div className="text-red-400 text-[12px]">{error}</div>}
  </div>
);

export const RequiredOnboarding: FC<{
  name?: string;
  email?: string;
  onDone: () => void;
}> = ({ name, email, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const [loading, setLoading] = useState(false);
  const fireEvents = useFireEvents();
  useTrackView('onboarding_step', { step: 'profile_form' });
  const form = useForm<Inputs>({
    resolver,
    defaultValues: {
      name: name || '',
      // A work address already says where they work, so start from it.
      website: email && isWorkEmail(email) ? email.split('@').pop() : '',
      role: '',
      heardFrom: '',
      useCase: '',
    },
  });

  const role = form.watch('role');
  const heardFrom = form.watch('heardFrom');
  const useCase = form.watch('useCase');

  const pick = useCallback(
    (field: keyof Inputs) => (value: string) =>
      form.setValue(field, value, { shouldValidate: true }),
    []
  );

  const logout = useCallback(async () => {
    await fetch('/user/logout', { method: 'POST' });
    window.location.href = '/';
  }, []);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    const response = await fetch('/user/onboarding', {
      method: 'POST',
      body: JSON.stringify({ ...data, attribution: readAttribution() }),
    });
    setLoading(false);

    if (response.ok) {
      fireEvents('onboarding_step', { step: 'profile_done', role: data.role, heard_from: data.heardFrom, use_case: data.useCase }, { send_instantly: true });
      onDone();
      return;
    }

    form.setError('name', {
      message: t(
        'onboarding_failed',
        'Something went wrong, please try again.'
      ),
    });
  };

  const pickOne = t('onboarding_pick_one', 'Please pick one');
  const errors = form.formState.errors;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex-1 flex items-center justify-center py-[40px]"
      >
        <div className="w-full max-w-[640px] bg-newBgColorInner rounded-[12px] p-[32px] flex flex-col gap-[24px] text-textColor">
          <div className="flex flex-col gap-[12px]">
            <Logo />
            <h1 className="text-[28px] font-[600] text-newTextColor">
              {t('onboarding_title', 'Tell us a bit about you')}
            </h1>
            <div className="text-[14px] text-textItemBlur">
              {t(
                'onboarding_subtitle',
                'A few quick questions, then you are in.'
              )}
            </div>
          </div>
          <Input
            label="Your name"
            translationKey="onboarding_name"
            {...form.register('name')}
            type="text"
            autoComplete="name"
            placeholder={t('onboarding_name_placeholder', 'Full name')}
          />
          <Input
            label="Company website"
            translationKey="onboarding_website"
            {...form.register('website')}
            type="text"
            autoComplete="url"
            placeholder={t(
              'onboarding_website_placeholder',
              'Your company or brand website'
            )}
          />
          <Options
            label={t('onboarding_role', 'What is your role?')}
            options={onboardingRoles}
            value={role}
            error={errors.role && pickOne}
            onChange={pick('role')}
          />
          <Options
            label={t('onboarding_use_case', 'What will you use it for?')}
            options={onboardingUseCases}
            value={useCase}
            error={errors.useCase && pickOne}
            onChange={pick('useCase')}
          />
          <Options
            label={t('onboarding_heard_from', 'Where did you find us?')}
            options={onboardingHeardFrom}
            value={heardFrom}
            error={errors.heardFrom && pickOne}
            onChange={pick('heardFrom')}
          />
          <div className="flex items-center gap-[16px]">
            <Button
              type="submit"
              className="flex-1 rounded-[10px] !h-[52px]"
              loading={loading}
            >
              {t('onboarding_continue', 'Continue')}
            </Button>
            <button
              type="button"
              onClick={logout}
              className="text-[14px] text-textItemBlur hover:text-newTextColor"
            >
              {t('logout', 'Logout')}
            </button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};
