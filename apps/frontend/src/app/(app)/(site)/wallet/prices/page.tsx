import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { WalletPricesPage } from '@gitroom/frontend/components/wallet/wallet.prices';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Voholabs Studio' : 'Gitroom'} Prices`,
  description: '',
};

export default async function Page() {
  return <WalletPricesPage />;
}
