'use client';

import { useLanguage } from '@/context/LanguageContext'
import type { MapData } from '@/lib/initial-data'
import React, { useEffect, useState } from 'react'

interface SharedBasesModalProps {
  isOpen: boolean;
  isLoading: boolean;
  bases: MapData[];
  currentUserId?: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filterMode: 'all' | 'my';
  onFilterModeChange: (mode: 'all' | 'my') => void;
  onClose: () => void;
  onSelectBase: (mapData: MapData) => void;
  onDeleteBase: (shareId: string) => void;
}

// Timestamps are stored as UTC milliseconds (Firebase ServerValue.TIMESTAMP), so
// formatting without an explicit timeZone renders them in each viewer's own
// local timezone automatically.
const formatShareDate = (timestamp?: number): string | null => {
  if (typeof timestamp !== 'number') return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return null;
  }
};

export const SharedBasesModal: React.FC<SharedBasesModalProps> = ({
  isOpen,
  isLoading,
  bases = [],
  currentUserId,
  currentPage,
  totalPages,
  onPageChange,
  searchQuery,
  onSearchQueryChange,
  filterMode,
  onFilterModeChange,
  onClose,
  onSelectBase,
  onDeleteBase
}) => {
  const { t } = useLanguage();
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

        {/* Фильтры и Поиск */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={t('searchBasePlaceholder')}
            className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors placeholder-neutral-500"
          />
          <div className="flex bg-neutral-950 border border-neutral-800 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => onFilterModeChange('all')}
              className={`flex-1 text-center w-24 px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {t('allBases')}
            </button>
            <button
              onClick={() => onFilterModeChange('my')}
              className={`flex-1 text-center w-24 px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                filterMode === 'my'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {t('myBases')}
            </button>
          </div>
        </div>

        {/* Список баз */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[150px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-xs text-neutral-400">
              <span className="animate-pulse">{t('loadingBasePlanner')}</span>
            </div>
          ) : bases.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-neutral-500">
              {t('emptySharedBases')}
            </div>
          ) : (
            bases.map((base) => {
              const isOwner = Boolean(currentUserId && base.ownerId === currentUserId);
              const createdLabel = formatShareDate(base.createdAt);
              const updatedLabel = formatShareDate(base.updatedAt);
              const showUpdated = Boolean(updatedLabel && updatedLabel !== createdLabel);

              return (
                <div
                  key={`${base.id}_${base.shareId}`}
                  className="flex items-center justify-between p-3 bg-neutral-950/60 hover:bg-neutral-800/60 border border-neutral-800/80 rounded-lg transition-all group"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-neutral-200 group-hover:text-amber-400 transition-colors">
                      {base.name}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      ID: {base.shareId}
                    </span>
                    {(createdLabel || showUpdated) && (
                      <span className="text-[10px] text-neutral-600 flex flex-wrap gap-x-3">
                        {createdLabel && <span>🕐 {t('createdLabel')}: {createdLabel}</span>}
                        {showUpdated && <span>✎ {t('updatedLabel')}: {updatedLabel}</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner && base.shareId && (
                      <button
                        onClick={() => onDeleteBase(base.shareId!)}
                        className="bg-red-900/40 hover:bg-red-800/60 text-red-300 font-bold px-2.5 py-1.5 rounded text-xs border border-red-700/50 transition-colors cursor-pointer"
                        title={t('deleteBtn')}
                      >
                        🗑️
                      </button>
                    )}
                    <button
                      onClick={() => onSelectBase(base)}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded text-xs border border-amber-500 transition-colors shadow-sm cursor-pointer"
                    >
                      {t('openBtn')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-neutral-800 text-xs">
            <button
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 text-neutral-300 font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              ◀
            </button>
            <span className="text-neutral-400 font-medium">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 text-neutral-300 font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              ▶
            </button>
          </div>
        )}

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