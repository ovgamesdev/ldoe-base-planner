import TermsOfService from '@/components/TermsOfService'

type Props = {
  params: Promise<{ lang: string }>;
};

export function generateStaticParams() {
  return [
    { lang: 'ru' },
    { lang: 'en' },
  ];
}

export default async function TermsOfServicePage(props: Props) {
  const { lang } = await props.params;
  
  return <TermsOfService />
}