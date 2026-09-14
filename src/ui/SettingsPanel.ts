import { applyObstaclePreset, applyZonePreset, type SimulationConfig } from '@/shared/config';
import { DEFAULT_TERRAIN_SETTINGS, type TerrainSettings } from '@/shared/config';
import { OBSTACLE_PRESETS, ZONE_PRESETS, type ObstaclePresetId, type ZonePresetId } from '@/shared/environment';

interface FieldBase {
  label: string;
  /** Изменение применяется только при сбросе мира */
  restart: boolean;
}

interface NumberField extends FieldBase {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  get(config: SimulationConfig): number;
  set(config: SimulationConfig, value: number): void;
}

interface SelectField extends FieldBase {
  kind: 'select';
  options: { value: string; label: string }[];
  get(config: SimulationConfig): string;
  set(config: SimulationConfig, value: string): void;
}

interface CheckboxField extends FieldBase {
  kind: 'checkbox';
  get(config: SimulationConfig): boolean;
  set(config: SimulationConfig, value: boolean): void;
}

type Field = NumberField | SelectField | CheckboxField;

interface Section {
  title: string;
  fields: Field[];
}

function terrainField(label: string, key: keyof TerrainSettings, min: number, max: number): NumberField {
  return {
    kind: 'number', label, restart: true, min, max, step: 1,
    get: (c) => (c.environment.terrainSettings ?? DEFAULT_TERRAIN_SETTINGS)[key],
    set: (c, v) => {
      c.environment.terrainSettings ??= { ...DEFAULT_TERRAIN_SETTINGS };
      c.environment.terrainSettings[key] = v;
    },
  };
}

function resizeWorld(config: SimulationConfig, axis: 'width' | 'depth', value: number): void {
  config.world[axis] = value;
  applyObstaclePreset(config, config.environment.obstaclePreset);
  applyZonePreset(config, config.environment.zonePreset);
}

const SECTIONS: Section[] = [
  {
    title: 'Мир',
    fields: [
      { kind: 'number', label: 'Seed', restart: true, min: -2147483648, max: 4294967295, step: 1, get: (c) => c.seed, set: (c, v) => (c.seed = v) },
      { kind: 'select', label: 'Режим', restart: true,
        options: [{ value: 'evolution', label: 'Эволюция' }, { value: 'settlement', label: 'Поселение: первый житель' }],
        get: (c) => c.mode ?? 'evolution', set: (c, v) => { c.mode = v as 'evolution' | 'settlement'; } },
      { kind: 'number', label: 'Ширина карты', restart: true, min: 50, max: 2000, step: 1, get: (c) => c.world.width, set: (c, v) => resizeWorld(c, 'width', v) },
      { kind: 'number', label: 'Длина карты', restart: true, min: 50, max: 2000, step: 1, get: (c) => c.world.depth, set: (c, v) => resizeWorld(c, 'depth', v) },
      {
        kind: 'select', label: 'Местность', restart: true,
        options: [{ value: 'geographic', label: 'Трава, песок, реки и озёра' }, { value: 'plain', label: 'Однородная равнина' }],
        get: (c) => c.environment.terrain ?? 'plain',
        set: (c, v) => { c.environment.terrain = v as 'plain' | 'geographic'; },
      },
      terrainField('Количество озёр', 'lakeCount', 0, 50),
      terrainField('Размер озёр (средний диаметр)', 'lakeSize', 1, 200),
      terrainField('Количество рек', 'riverCount', 0, 10),
      terrainField('Ширина рек', 'riverWidth', 1, 50),
      terrainField('Песок (% суши; остальное — трава)', 'sandPercent', 0, 100),
      {
        kind: 'number', label: 'Стартовая популяция', restart: true, min: 0, max: 5000, step: 1,
        get: (c) => c.population.initial, set: (c, v) => (c.population.initial = v),
      },
      {
        kind: 'number', label: 'Стартовые хищники', restart: true, min: 0, max: 5000, step: 1,
        get: (c) => c.population.initialPredators, set: (c, v) => (c.population.initialPredators = v),
      },
      {
        kind: 'number', label: 'Стартовая пища', restart: true, min: 0, max: 10000, step: 1,
        get: (c) => c.food.initial, set: (c, v) => (c.food.initial = v),
      },
      {
        kind: 'select', label: 'Препятствия', restart: true,
        options: Object.entries(OBSTACLE_PRESETS).map(([value, preset]) => ({ value, label: preset.label })),
        get: (c) => c.environment.obstaclePreset,
        set: (c, v) => applyObstaclePreset(c, v as ObstaclePresetId),
      },
    ],
  },
  {
    title: 'Ресурсы',
    fields: [
      {
        kind: 'select', label: 'Зоны', restart: false,
        options: Object.entries(ZONE_PRESETS).map(([value, preset]) => ({ value, label: preset.label })),
        get: (c) => c.environment.zonePreset,
        set: (c, v) => applyZonePreset(c, v as ZonePresetId),
      },
      {
        kind: 'number', label: 'Новые растения в секунду', restart: false, min: 0, max: 1000, step: 1,
        get: (c) => c.food.spawnPerSecond, set: (c, v) => (c.food.spawnPerSecond = v),
      },
      {
        kind: 'number', label: 'Максимум пищи', restart: false, min: 0, max: 20000, step: 1,
        get: (c) => c.food.max, set: (c, v) => (c.food.max = v),
      },
      {
        kind: 'number', label: 'Энергия пищи', restart: false, min: 0, max: 500, step: 1,
        get: (c) => c.food.energy, set: (c, v) => (c.food.energy = v),
      },
    ],
  },
  {
    title: 'Хищники',
    fields: [
      {
        kind: 'number', label: 'Вероятность поимки', restart: false, min: 0, max: 1, step: 0.05,
        get: (c) => c.predation.catchChance, set: (c, v) => (c.predation.catchChance = v),
      },
      {
        kind: 'number', label: 'Пауза между попытками, с', restart: false, min: 0, max: 60, step: 0.1,
        get: (c) => c.predation.attackCooldown, set: (c, v) => (c.predation.attackCooldown = v),
      },
      {
        kind: 'number', label: 'Ценность тела жертвы на размер', restart: false, min: 0, max: 1000, step: 1,
        get: (c) => c.predation.bodyEnergyPerSize, set: (c, v) => (c.predation.bodyEnergyPerSize = v),
      },
      {
        kind: 'number', label: 'Усвоение добычи', restart: false, min: 0, max: 1, step: 0.05,
        get: (c) => c.predation.efficiency, set: (c, v) => (c.predation.efficiency = v),
      },
      {
        kind: 'number', label: 'Желудок хищника (доля вместимости)', restart: false, min: 0.05, max: 2, step: 0.05,
        get: (c) => c.predation.stomachShare, set: (c, v) => (c.predation.stomachShare = v),
      },
      {
        kind: 'number', label: 'Радиус чутья', restart: false, min: 0, max: 500, step: 1,
        get: (c) => c.predation.scentRadius, set: (c, v) => (c.predation.scentRadius = v),
      },
      {
        kind: 'number', label: 'Радиус заботы о детёнышах', restart: false, min: 0, max: 100, step: 1,
        get: (c) => c.predation.shareRadius, set: (c, v) => (c.predation.shareRadius = v),
      },
      {
        kind: 'number', label: 'Бегство после потери из виду, с', restart: false, min: 0, max: 60, step: 0.5,
        get: (c) => c.predation.fleeDuration, set: (c, v) => (c.predation.fleeDuration = v),
      },
      {
        kind: 'number', label: 'Приток пары извне раз в, с (0 — нет)', restart: false, min: 0, max: 3600, step: 1,
        get: (c) => c.predation.immigrationInterval, set: (c, v) => (c.predation.immigrationInterval = v),
      },
    ],
  },
  {
    title: 'Сезонность',
    fields: [
      { kind: 'checkbox', label: 'Включена', restart: false, get: (c) => c.season.enabled, set: (c, v) => (c.season.enabled = v) },
      {
        kind: 'number', label: 'Период, с', restart: false, min: 5, max: 3600, step: 5,
        get: (c) => c.season.period, set: (c, v) => (c.season.period = v),
      },
      {
        kind: 'number', label: 'Размах', restart: false, min: 0, max: 1, step: 0.05,
        get: (c) => c.season.amplitude, set: (c, v) => (c.season.amplitude = v),
      },
    ],
  },
  {
    title: 'Жизнь и мутации',
    fields: [
      {
        kind: 'number', label: 'Возраст зрелости, с', restart: false, min: 0, max: 3600, step: 1,
        get: (c) => c.lifecycle.minReproductionAge, set: (c, v) => (c.lifecycle.minReproductionAge = v),
      },
      {
        kind: 'number', label: 'Продолжительность роста, с', restart: false, min: 1, max: 3600, step: 1,
        get: (c) => c.physiology.growthDuration, set: (c, v) => (c.physiology.growthDuration = v),
      },
      {
        kind: 'number', label: 'Беременность, с', restart: false, min: 1, max: 3600, step: 1,
        get: (c) => c.reproduction.gestationDuration, set: (c, v) => (c.reproduction.gestationDuration = v),
      },
      {
        kind: 'number', label: 'Восстановление самки, с', restart: false, min: 0, max: 3600, step: 1,
        get: (c) => c.reproduction.femaleRecovery, set: (c, v) => (c.reproduction.femaleRecovery = v),
      },
      {
        kind: 'number', label: 'Восстановление самца, с', restart: false, min: 0, max: 3600, step: 1,
        get: (c) => c.reproduction.maleRecovery, set: (c, v) => (c.reproduction.maleRecovery = v),
      },
      {
        kind: 'number', label: 'Переваривание в секунду', restart: false, min: 0.1, max: 100, step: 0.1,
        get: (c) => c.physiology.digestionPerSecond, set: (c, v) => (c.physiology.digestionPerSecond = v),
      },
      {
        kind: 'number', label: 'Восстановление растений / с', restart: false, min: 0, max: 100, step: 0.1,
        get: (c) => c.resources.regrowthPerSecond, set: (c, v) => (c.resources.regrowthPerSecond = v),
      },
      {
        kind: 'number', label: 'Память о растении при длительности ×1, с', restart: false, min: 0, max: 3600, step: 1,
        get: (c) => c.perception.memoryDuration, set: (c, v) => (c.perception.memoryDuration = v),
      },
      {
        kind: 'number', label: 'Расход на место памяти / с', restart: false, min: 0, max: 10, step: 0.01,
        get: (c) => c.perception.memoryCost, set: (c, v) => (c.perception.memoryCost = v),
      },
      {
        kind: 'number', label: 'Радиус брачного зова', restart: false, min: 0, max: 500, step: 1,
        get: (c) => c.perception.mateCallRadius, set: (c, v) => (c.perception.mateCallRadius = v),
      },
      {
        kind: 'number', label: 'Вероятность мутации', restart: false, min: 0, max: 1, step: 0.01,
        get: (c) => c.mutation.rate, set: (c, v) => (c.mutation.rate = v),
      },
      {
        kind: 'number', label: 'Сила мутаций', restart: false, min: 0, max: 10, step: 0.1,
        get: (c) => c.mutation.sigmaScale, set: (c, v) => (c.mutation.sigmaScale = v),
      },
      {
        kind: 'number', label: 'Начало старения при долголетии ×1, с', restart: false, min: 1, max: 3600, step: 1,
        get: (c) => c.lifecycle.maxAge, set: (c, v) => (c.lifecycle.maxAge = v),
      },
      {
        kind: 'number', label: 'Цена долголетия (показатель)', restart: false, min: 0, max: 5, step: 0.1,
        get: (c) => c.lifecycle.longevityCost, set: (c, v) => (c.lifecycle.longevityCost = v),
      },
      {
        kind: 'number', label: 'Предел популяции', restart: false, min: 1, max: 20000, step: 1,
        get: (c) => c.population.max, set: (c, v) => (c.population.max = v),
      },
    ],
  },
];

export interface SettingsActions {
  apply(config: SimulationConfig, reset: boolean): void;
}

interface FieldView {
  field: Field;
  row: HTMLElement;
  input: HTMLInputElement | HTMLSelectElement;
  badge: HTMLElement;
}

/**
 * Настройки эксперимента: черновик конфигурации применяется во время запуска или со сбросом
 * Поля, требующие сброса, помечаются, пока текущий запуск идет с другим значением
 */
export class SettingsPanel {
  private readonly _root: HTMLDetailsElement;
  private readonly _actions: SettingsActions;
  private readonly _views: FieldView[] = [];
  private readonly _applyButton: HTMLButtonElement;
  private readonly _applyResetButton: HTMLButtonElement;
  private readonly _revertButton: HTMLButtonElement;
  private readonly _status: HTMLElement;
  private _current: SimulationConfig | null = null;
  private _next: SimulationConfig | null = null;
  private _draft: SimulationConfig | null = null;

  public constructor(container: HTMLElement, actions: SettingsActions) {
    this._actions = actions;

    this._root = document.createElement('details');
    this._root.className = 'panel settings-panel';
    const summary = document.createElement('summary');
    summary.className = 'panel__title panel__summary';
    summary.textContent = 'Настройки эксперимента';
    this._root.appendChild(summary);

    for (const section of SECTIONS) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'settings-panel__section';
      if (section.title !== 'Мир') fieldset.classList.add('settings-evolution-only');
      const legend = document.createElement('legend');
      legend.textContent = section.title;
      fieldset.appendChild(legend);
      for (const field of section.fields) {
        fieldset.appendChild(this._createField(field));
      }
      if (section.title === 'Мир') {
        const terrainHint = document.createElement('p');
        terrainHint.className = 'settings-panel__status';
        terrainHint.textContent = 'Seed задаёт карту. Размеры — в единицах мира. Озёра и реки могут соединяться. Песок — процент суши, остальное — трава. Параметры ландшафта действуют в режиме «Трава, песок, реки и озёра» после сброса. Зелёный — плодородная земля; песочный — рост растений 7%; голубой — непроходимая вода.';
        fieldset.appendChild(terrainHint);
      }
      this._root.appendChild(fieldset);
    }

    const randomSeed = document.createElement('button');
    randomSeed.type = 'button';
    randomSeed.className = 'settings-panel__inline-button';
    randomSeed.textContent = 'Случайный';
    randomSeed.addEventListener('click', () => {
      this._edit((draft) => (draft.seed = Math.floor(Math.random() * 1_000_000)));
    });
    this._views[0]!.row.appendChild(randomSeed);

    this._status = document.createElement('p');
    this._status.className = 'settings-panel__status';

    const buttons = document.createElement('div');
    buttons.className = 'control-panel__row settings-panel__buttons';
    this._applyButton = this._button(buttons, 'Применить', () => this._apply(false));
    this._applyResetButton = this._button(buttons, 'Применить и сбросить', () => this._apply(true));
    this._revertButton = this._button(buttons, 'Отменить', () => {
      this._draft = this._next ? structuredClone(this._next) : null;
      this._render();
    });

    this._root.append(this._status, buttons);
    container.appendChild(this._root);
    this._render();
  }

  /** Конфигурации от Worker; черновик без неприменённых правок заменяется следующей конфигурацией */
  public setConfig(current: SimulationConfig, next: SimulationConfig): void {
    const hasEdits = this._draft && this._next && JSON.stringify(this._draft) !== JSON.stringify(this._next);
    this._current = current;
    this._next = next;
    if (!hasEdits) {
      this._draft = structuredClone(next);
    }
    this._render();
  }

  public dispose(): void {
    this._root.remove();
  }

  private _apply(reset: boolean): void {
    if (this._draft) {
      this._actions.apply(structuredClone(this._draft), reset);
    }
  }

  private _edit(change: (draft: SimulationConfig) => void): void {
    if (!this._draft) {
      return;
    }
    change(this._draft);
    this._render();
  }

  private _createField(field: Field): HTMLElement {
    const row = document.createElement('label');
    row.className = 'settings-field';
    if (field.label.startsWith('Стартов')) row.classList.add('settings-evolution-only');
    const label = document.createElement('span');
    label.className = 'settings-field__label';
    label.textContent = field.label;

    let input: HTMLInputElement | HTMLSelectElement;
    if (field.kind === 'select') {
      const select = document.createElement('select');
      for (const option of field.options) {
        select.add(new Option(option.label, option.value));
      }
      select.addEventListener('change', () => this._edit((draft) => field.set(draft, select.value)));
      input = select;
    } else if (field.kind === 'checkbox') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => this._edit((draft) => field.set(draft, checkbox.checked)));
      input = checkbox;
    } else {
      const number = document.createElement('input');
      number.type = 'number';
      number.min = String(field.min);
      number.max = String(field.max);
      number.step = String(field.step);
      number.addEventListener('change', () => {
        const value = Number(number.value);
        const valid = number.value !== '' && Number.isFinite(value) && value >= field.min && value <= field.max;
        const integer = field.step === 1;
        this._edit((draft) => {
          if (valid && (!integer || Number.isInteger(value))) {
            field.set(draft, value);
          }
        });
      });
      input = number;
    }

    const badge = document.createElement('span');
    badge.className = 'settings-field__badge';
    badge.textContent = 'после сброса';
    badge.hidden = true;

    row.append(label, input, badge);
    this._views.push({ field, row, input, badge });
    return row;
  }

  private _render(): void {
    const draft = this._draft;
    this._root.classList.toggle('settings-settlement', draft?.mode === 'settlement');
    const current = this._current;
    const next = this._next;
    let dirty = false;
    let pendingRestart = false;

    for (const view of this._views) {
      const { field, input, badge, row } = view;
      input.disabled = !draft;
      if (!draft || !current || !next) {
        continue;
      }

      const value = field.get(draft);
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = value as boolean;
      } else {
        input.value = String(value);
      }

      const changedFromNext = value !== field.get(next);
      const differsFromCurrent = value !== field.get(current);
      dirty ||= changedFromNext;
      const waitsForReset = field.restart && differsFromCurrent;
      pendingRestart ||= waitsForReset;

      badge.hidden = !waitsForReset;
      row.classList.toggle('settings-field--dirty', changedFromNext);
    }

    this._applyButton.disabled = !draft || !dirty;
    this._revertButton.disabled = !draft || !dirty;
    this._applyResetButton.disabled = !draft;
    this._status.textContent = dirty
      ? 'Есть неприменённые изменения'
      : pendingRestart
        ? 'Часть настроек применится после сброса'
        : 'Настройки совпадают с текущим запуском';
  }

  private _button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    parent.appendChild(button);
    return button;
  }
}
