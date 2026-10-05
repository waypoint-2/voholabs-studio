import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { WalletBillingPage } from '@gitroom/frontend/components/wallet/wallet.billing';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Voholabs Studio' : 'Gitroom'} Billing`,
  description: '',
};

export default async function Page() {
  return <WalletBillingPage />;
}
