import { useLanguage } from '@/context/LanguageContext'
import { ModalInfoData } from '@/lib/initial-data'
import { memo, useEffect, useRef, useState } from 'react'

interface ModalInfoProps {
  modalInfo: ModalInfoData | null;
  onClose: () => void;
}

// Ключ в localStorage под конкретный dontShowAgainKey из ModalInfoData.
const dontShowAgainStorageKey = (key: string) => `ldoe_dsa_${key}`;

// Проверяет, отмечал ли пользователь ранее "Больше не показывать" для этого key.
// Экспортируется, чтобы вызывающий код (например showAlert) мог пропустить показ
// модалки целиком, а не просто скрыть чекбокс.
export const isDontShowAgainDismissed = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(dontShowAgainStorageKey(key)) === '1';
  } catch {
    return false;
  }
};

export const ModalInfo = memo(function ModalInfo({ modalInfo, onClose }: ModalInfoProps) {
  const { t } = useLanguage();
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);

  const modalInfoRef = useRef(modalInfo);
  if (modalInfo) {
    modalInfoRef.current = modalInfo;
  }

  useEffect(() => {
    if (modalInfo) {
      setIsRendered(true);
      setDontShowAgainChecked(false);
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [modalInfo]);

  const persistDontShowAgain = () => {
    const key = modalInfoRef.current?.dontShowAgainKey;
    if (!key || !dontShowAgainChecked) return;
    try {
      window.localStorage.setItem(dontShowAgainStorageKey(key), '1');
    } catch {
      // Игнорируем — например, localStorage недоступен в приватном режиме.
    }
  };

  const handleConfirm = () => {
    persistDontShowAgain();
    modalInfoRef.current?.onConfirm?.();
    onClose();
  };

  const handleCancel = () => {
    persistDontShowAgain();
    modalInfoRef.current?.onCancel?.();
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalInfo) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const cancelText = modalInfoRef.current?.cancelText;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out select-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleCancel}
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
            onClick={handleCancel}
            className="text-neutral-400 hover:text-white rounded-lg p-1 transition cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <div className="text-xs text-neutral-300 leading-relaxed mb-5 whitespace-pre-wrap">
          {modalInfoRef.current?.message}
        </div>

        {modalInfoRef.current?.dontShowAgainKey && (
          <label className="flex items-center gap-2 mb-4 text-xs text-neutral-400 hover:text-neutral-300 transition cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgainChecked}
              onChange={e => setDontShowAgainChecked(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
            />
            {t('dontShowAgain')}
          </label>
        )}

        <div className="flex justify-end gap-2">
          {cancelText && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded text-xs transition cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold border border-neutral-700"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded text-xs transition cursor-pointer ${config.button}`}
          >
            {modalInfoRef.current?.confirmText || t('gotItBtn')}
          </button>
        </div>
      </div>
    </div>
  );
});