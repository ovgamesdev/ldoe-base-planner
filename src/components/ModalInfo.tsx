import { useLanguage } from '@/context/LanguageContext'
import { memo, useEffect, useRef, useState } from 'react'

export interface ModalInfoData {
  title?: string;
  message: string;
  type?: 'error' | 'info' | 'success' | 'warning';
}

interface ModalInfoProps {
  modalInfo: ModalInfoData | null;
  onClose: () => void;
}

export const ModalInfo = memo(function ModalInfo({ modalInfo, onClose }: ModalInfoProps) {
  const { t } = useLanguage();
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const modalInfoRef = useRef(modalInfo);
  if (modalInfo) {
    modalInfoRef.current = modalInfo;
  }

  useEffect(() => {
    if (modalInfo) {
      setIsRendered(true);
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [modalInfo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalInfo) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalInfo, onClose]);

  if (!isRendered && !modalInfo) return null;

  const typeConfig = {
    error: {
      border: 'border-red-500/40',
      button: 'bg-red-600 hover:bg-red-500 text-white font-bold',
      defaultTitle: t('errorTitle'),
      icon: '⚠️'
    },
    warning: {
      border: 'border-amber-500/40',
      button: 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold',
      defaultTitle: t('warningTitle'),
      icon: '⚡'
    },
    success: {
      border: 'border-emerald-500/40',
      button: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold',
      defaultTitle: t('successTitle'),
      icon: '✓'
    },
    info: {
      border: 'border-amber-500/40',
      button: 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold',
      defaultTitle: t('infoTitle'),
      icon: 'ℹ️'
    }
  };

  const currentType = modalInfoRef.current?.type || 'info';
  const config = typeConfig[currentType];
  const title = modalInfoRef.current?.title || config.defaultTitle;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out select-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-neutral-900 border ${config.border} rounded-xl p-5 max-w-md w-full shadow-2xl transform transition-all duration-200 ease-out ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-2'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="text-base">{config.icon}</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white rounded-lg p-1 transition cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <div className="text-xs text-neutral-300 leading-relaxed mb-5 whitespace-pre-wrap">
          {modalInfoRef.current?.message}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded text-xs transition cursor-pointer ${config.button}`}
          >
            {t('gotItBtn')}
          </button>
        </div>
      </div>
    </div>
  );
});