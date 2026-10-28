import type { BuildPoint } from './build-modes'
import type { BuildPreview } from './useBuildTools'

// Хранилище предпросмотра массового действия вне React-состояния.
// Раньше каждая новая клетка под кистью/курсором делала setState в useBuildTools и перерисовывала весь
// MainPlannerClient. Теперь состояние жеста лежит здесь, а подписан на него только слой предпросмотра
// (BuildPreviewLayer): на движение перерисовывается он один.

export interface BuildViewState {
  anchor: BuildPoint | null;
  hover: BuildPoint | null;
  stroke: BuildPoint[];
}

export interface BuildPreviewSnapshot {
  anchor: BuildPoint | null;
  preview: BuildPreview | null;
}

export type BuildPlanner = (view: BuildViewState) => BuildPreview | null;

const EMPTY_VIEW: BuildViewState = { anchor: null, hover: null, stroke: [] };
const EMPTY_SNAPSHOT: BuildPreviewSnapshot = { anchor: null, preview: null };

export function createBuildPreviewStore() {
  let view: BuildViewState = EMPTY_VIEW;
  let planner: BuildPlanner | null = null;
  let snapshot: BuildPreviewSnapshot | null = null; // кэш: план считается один раз на изменение жеста/карты
  const subs = new Set<() => void>();

  const isEmpty = () => !view.anchor && !view.hover && view.stroke.length === 0;
  const emit = () => { snapshot = null; subs.forEach(fn => fn()); };

  return {
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    getSnapshot(): BuildPreviewSnapshot {
      if (!snapshot) snapshot = { anchor: view.anchor, preview: planner ? planner(view) : null };
      return snapshot;
    },
    getServerSnapshot(): BuildPreviewSnapshot {
      return EMPTY_SNAPSHOT;
    },
    setView(next: BuildViewState) {
      view = next;
      emit();
    },
    // Сброс жеста; подписчиков будим, только если было что показывать.
    clear() {
      if (isEmpty()) return;
      view = EMPTY_VIEW;
      emit();
    },
    // Карта или режим изменились: пересчитать показанный предпросмотр (если он есть).
    setPlanner(next: BuildPlanner) {
      planner = next;
      if (!isEmpty()) emit();
      else snapshot = null;
    },
  };
}

export type BuildPreviewStore = ReturnType<typeof createBuildPreviewStore>;
