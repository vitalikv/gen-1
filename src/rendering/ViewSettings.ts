import { GENE_DEFINITIONS, GENE_NAMES, type GeneName } from '@/shared/genes';

/** Признак, которым окрашиваются организмы */
export type ColorMode = 'energy' | 'sex' | GeneName;

export const COLOR_MODE_OPTIONS: readonly { value: ColorMode; label: string }[] = [
  { value: 'sex', label: 'Пол' },
  { value: 'energy', label: 'Энергия' },
  ...GENE_NAMES.map((name) => ({ value: name, label: GENE_DEFINITIONS[name].label })),
];

export interface ViewSettingsState {
  colorMode: ColorMode;
  showPerception: boolean;
  /** Ген, распределение которого показывают графики */
  chartGene: GeneName;
}

type Listener = (state: Readonly<ViewSettingsState>) => void;

/**
 * Настройки отображения, общие для интерфейса и визуализации
 */
export class ViewSettings {
  private _state: ViewSettingsState = { colorMode: 'sex', showPerception: false, chartGene: 'speed' };
  private readonly _listeners = new Set<Listener>();

  public get state(): Readonly<ViewSettingsState> {
    return this._state;
  }

  public update(changes: Partial<ViewSettingsState>): void {
    this._state = { ...this._state, ...changes };
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
