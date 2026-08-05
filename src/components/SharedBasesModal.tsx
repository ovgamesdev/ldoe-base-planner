'use client';

import React, { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import type { MapData } from '../lib/initial-data'

interface SharedBasesModalProps {
  isOpen: boolean;
  isLoading: boolean;
  sharedBasesList: MapData[];
  onClose: () => void;
  onSelectMap: (mapData: MapData) => void;
}

export const SharedBasesModal: React.FC<SharedBasesModalProps> = ({
  isOpen,
  isLoading,
  sharedBasesList,
  onClose,
  onSelectMap
}) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRendered(true);
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isRendered && !isOpen) return null;

  const filteredBases = sharedBasesList.filter((base) =>
    base.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-200 ease-out select-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl transform transition-all duration-200 ease-out ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <h3 className="text-lg font-bold text-amber-500 flex items-center gap-2">
            <span>🌐</span> {t('publicBasesTitle')}
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
            title={t('closeBtn')}
          >
            ✕
          </button>
        </div>

        {/* Описание */}
        <div className="my-3 text-xs text-neutral-300 leading-relaxed">
          <p>{t('publicBasesDescription')}</p>
          <p className="mt-1 text-amber-400 font-medium">
            💡 {t('publicBasesWarning')}
          </p>
        </div>

        {/* Поиск */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchBasePlaceholder')}
            className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors placeholder-neutral-500"
          />
        </div>

        {/* Список баз */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[150px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-xs text-neutral-400">
              <span className="animate-pulse">{t('loadingBasePlanner')}</span>
            </div>
          ) : filteredBases.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-neutral-500">
              {t('emptySharedBases')}
            </div>
          ) : (
            filteredBases.map((base) => (
              <div
                key={base.id}
                className="flex items-center justify-between p-3 bg-neutral-950/60 hover:bg-neutral-800/60 border border-neutral-800/80 rounded-lg transition-all group"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-neutral-200 group-hover:text-amber-400 transition-colors">
                    {base.name}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    ID: {base.id}
                  </span>
                </div>
                <button
                  onClick={() => onSelectMap(base)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded text-xs border border-amber-500 transition-colors shadow-sm cursor-pointer"
                >
                  {t('openBtn')}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Футер */}
        <div className="mt-4 pt-3 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold px-4 py-2 rounded-lg text-xs border border-neutral-700 transition-colors cursor-pointer"
          >
            {t('closeBtn')}
          </button>
        </div>

      </div>
    </div>
  );
};