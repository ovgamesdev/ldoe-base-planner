import PrivacyPolicy from '@/components/PrivacyPolicy'

type Props = {
  params: Promise<{ lang: string }>;
};

export function generateStaticParams() {
  return [
    { lang: 'ru' },
    { lang: 'en' },
  ];
}

export default async function PrivacyPolicyPage(props: Props) {
  const { lang } = await props.params;
  
  return <PrivacyPolicy />
}