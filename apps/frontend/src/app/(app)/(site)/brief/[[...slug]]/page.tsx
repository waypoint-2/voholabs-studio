export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { BriefPage } from '@gitroom/frontend/components/agent-brief/brief.page';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Voholabs Studio' : 'Gitroom'} Brief`,
  description: '',
};
export default async function Index() {
  return <BriefPage />;
}
