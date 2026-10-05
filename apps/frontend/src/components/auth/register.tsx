'use client';

import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { GithubProvider } from '@gitroom/frontend/components/auth/providers/github.provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import clsx from 'clsx';
import { GoogleProvider } from '@gitroom/frontend/components/auth/providers/google.provider';
import { OauthProvider } from '@gitroom/frontend/components/auth/providers/oauth.provider';
import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useTrack } from '@gitroom/react/helpers/use.track';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { FarcasterProvider } from '@gitroom/frontend/components/auth/providers/farcaster.provider';
import dynamic from 'next/dynamic';
import { WalletUiProvider } from '@gitroom/frontend/components/auth/providers/placeholder/wallet.ui.provider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useCookie from 'react-use-cookie';
const WalletProvider = dynamic(
  () => import('@gitroom/frontend/components/auth/providers/wallet.provider'),
  {
    ssr: false,
    loading: () => <WalletUiProvider />,
  }
);
type Inputs = {
  email: string;
  password: string;
  company: string;
  providerToken: string;
  provider: string;
  termsAccepted: boolean;
  contactConsent: boolean;
};
export function Register() {
  const getQuery = useSearchParams();
  const fetch = useFetch();
  const [provider] = useState(getQuery?.get('provider')?.toUpperCase());
  const [code, setCode] = useState(getQuery?.get('code') || '');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (provider && code) {
      load();
    }
  }, []);
  const load = useCallback(async () => {
    const response = await fetch(
      `/auth/oauth/${provider?.toUpperCase() || 'LOCAL'}/exists`,
      {
        method: 'POST',
        body: JSON.stringify({
          code,
        }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'We could not sign you in. Please try again.');
      return;
    }
    if (data?.token) {
      setCode(data.token);
      setShow(true);
    }
  }, [provider, code]);
  if (error) {
    return <RegisterBlocked message={error} />;
  }
  if (!code && !provider) {
    return <RegisterAfter token="" provider="LOCAL" />;
  }
  if (!show) {
    return <LoadingComponent />;
  }
  return (
    <RegisterAfter token={code} provider={provider?.toUpperCase() || 'LOCAL'} />
  );
}
function RegisterBlocked({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-[40px] font-[500] -tracking-[0.8px] text-start">
        {t('sign_up', 'Sign Up')}
      </h1>
      <div className="mt-[32px] text-[14px] text-red-400">{message}</div>
      <div className="mt-[24px] flex">
        <Link
          href="/auth"
          className="flex-1 rounded-[10px] h-[52px] flex items-center justify-center bg-forth text-white"
        >
          {t('back_to_sign_up', 'Back to sign up')}
        </Link>
      </div>
      <p className="mt-4 text-sm text-center">
        {t('already_have_an_account', 'Already Have An Account?')}
        &nbsp;
        <Link href="/auth/login" className="underline cursor-pointer">
          {t('sign_in', 'Sign In')}
        </Link>
      </p>
    </div>
  );
}
function getHelpfulReasonForRegistrationFailure(httpCode: number) {
  switch (httpCode) {
    case 400:
      return 'Email already exists';
    case 404:
      return 'Your browser got a 404 when trying to contact the API, the most likely reasons for this are the NEXT_PUBLIC_BACKEND_URL is set incorrectly, or the backend is not running.';
  }
  return 'Unhandled error: ' + httpCode;
}
export function RegisterAfter({
  token,
  provider,
}: {
  token: string;
  provider: string;
}) {
  const t = useT();
  const { isGeneral, genericOauth, neynarClientId, billingEnabled } =
    useVariables();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const fireEvents = useFireEvents();
  const track = useTrack();
  const [datafast_visitor_id] = useCookie('datafast_visitor_id');
  const isAfterProvider = useMemo(() => {
    return !!token && !!provider;
  }, [token, provider]);
  const resolver = useMemo(() => {
    return classValidatorResolver(CreateOrgUserDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: {
      providerToken: token,
      provider: provider,
      termsAccepted: false,
      contactConsent: false,
    },
  });
  const fetchData = useFetch();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    // No account without the box. The server refuses it as well.
    if (!data.termsAccepted) {
      form.setError('termsAccepted', {
        message: t(
          'please_agree_to_the_terms',
          'Please agree to the Terms of Service and Privacy Policy to continue'
        ),
      });
      return;
    }

    if (!data.contactConsent) {
      form.setError('contactConsent', {
        message: t(
          'please_agree_to_be_contacted',
          'Please tick this box to continue'
        ),
      });
      return;
    }

    setLoading(true);
    await fetchData('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        datafast_visitor_id,
      }),
    })
      .then(async (response) => {
        setLoading(false);
        if (response.status === 200) {
          fireEvents('register');
          return track(TrackEnum.CompleteRegistration).then(() => {
            if (response.headers.get('activate') === 'true') {
              router.push('/auth/activate');
            } else {
              router.push('/auth/login');
            }
          });
        } else {
          form.setError('email', {
            message: await response.text(),
          });
        }
      })
      .catch((e) => {
        form.setError('email', {
          message:
            'General error: ' +
            e.toString() +
            '. Please check your browser console.',
        });
      });
  };
  return (
    <FormProvider {...form}>
      <form method="post" className="flex-1 flex" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col flex-1">
          <div className="flex items-end justify-between gap-[12px] flex-wrap">
            <h1 className="text-[40px] font-[500] -tracking-[0.8px] text-start cursor-pointer">
              {t('sign_up', 'Sign Up')}
            </h1>
            {/* Returning users find the way in without scrolling past the form. */}
            <p className="text-[14px] pb-[8px]">
              {t('already_have_an_account', 'Already Have An Account?')}
              &nbsp;
              <Link href="/auth/login" className="underline cursor-pointer">
                {t('sign_in', 'Sign In')}
              </Link>
            </p>
          </div>
          <div className="text-[14px] mt-[32px] mb-[12px]">
            {t('continue_with', 'Continue With')}
          </div>
          <div className="flex flex-col">
            {!isAfterProvider &&
              (!isGeneral ? (
                <GithubProvider />
              ) : (
                <div className="gap-[8px] flex">
                  {genericOauth && isGeneral ? (
                    <OauthProvider />
                  ) : (
                    <GoogleProvider />
                  )}
                  {!!neynarClientId && <FarcasterProvider />}
                  {billingEnabled && <WalletProvider />}
                </div>
              ))}
            {!isAfterProvider && (
              <div className="h-[20px] mb-[24px] mt-[24px] relative">
                <div className="absolute w-full h-[1px] bg-fifth top-[50%] -translate-y-[50%]" />
                <div
                  className={`absolute z-[1] justify-center items-center w-full start-0 -top-[4px] flex`}
                >
                  <div className="px-[16px]">{t('or', 'or')}</div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-[12px]">
              <div className="text-textColor">
                {!isAfterProvider && (
                  <>
                    <Input
                      label="Email"
                      translationKey="label_email"
                      {...form.register('email')}
                      type="email"
                      placeholder={t('email_address', 'Email Address')}
                    />
                    <Input
                      label="Password"
                      translationKey="label_password"
                      {...form.register('password')}
                      autoComplete="off"
                      type="password"
                      placeholder={t('label_password', 'Password')}
                    />
                  </>
                )}
                <Input
                  label="Company"
                  translationKey="label_company"
                  {...form.register('company')}
                  autoComplete="off"
                  type="text"
                  placeholder={t('label_company', 'Company')}
                />
              </div>
              <div className="flex gap-[10px] items-start text-[14px]">
                <Checkbox name="termsAccepted" variant="hollow" />
                <div className="flex-1 pt-[3px]">
                  {t(
                    'i_agree_to_the',
                    'I use Voholabs Studio for my business and I agree to the'
                  )}
                  &nbsp;
                  <a
                    href={`/terms`}
                    target="_blank"
                    className="underline hover:font-bold"
                    rel="nofollow noreferrer"
                  >
                    {t('terms_of_service', 'Terms of Service')}
                  </a>
                  .&nbsp;
                  {t('i_have_read_the', 'I have read the')}&nbsp;
                  <a
                    href={`/privacy`}
                    target="_blank"
                    rel="nofollow noreferrer"
                    className="underline hover:font-bold"
                  >
                    {t('privacy_policy', 'Privacy Policy')}
                  </a>
                  .
                  {!!form.formState.errors.termsAccepted && (
                    <div className="text-red-400 mt-[4px]">
                      {form.formState.errors.termsAccepted.message}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-[10px] items-start text-[14px]">
                <Checkbox name="contactConsent" variant="hollow" />
                <div className="flex-1 pt-[3px]">
                  {t(
                    'i_agree_to_be_contacted',
                    'Email me news, tips and offers from Voholabs. Unsubscribe anytime.'
                  )}
                  {!!form.formState.errors.contactConsent && (
                    <div className="text-red-400 mt-[4px]">
                      {form.formState.errors.contactConsent.message}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-center mt-6">
                <div className="w-full flex">
                  <Button
                    type="submit"
                    className="flex-1 rounded-[10px] !h-[52px]"
                    loading={loading}
                  >
                    {t('create_account', 'Create Account')}
                  </Button>
                </div>
                <p className="mt-4 text-sm">
                  {t('already_have_an_account', 'Already Have An Account?')}
                  &nbsp;
                  <Link
                    href="/auth/login"
                    className="underline  cursor-pointer"
                  >
                    {t('sign_in', 'Sign In')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
