import { Language, LanguageProvider } from '@/context/LanguageContext'
import React from 'react'

export default async function LangLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await props.params;
  const validLang: Language = lang === 'en' ? 'en' : 'ru';

  return (
    <LanguageProvider initialLang={validLang}>
      {props.children}
    </LanguageProvider>
  );
}