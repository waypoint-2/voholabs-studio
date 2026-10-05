export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { SkillsPage } from '@gitroom/frontend/components/skills/skills.page';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Voholabs Studio' : 'Gitroom'} Skills`,
  description: '',
};
export default async function Index() {
  return <SkillsPage />;
}
