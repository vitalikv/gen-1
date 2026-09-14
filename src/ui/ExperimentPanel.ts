import type { ViewSettings } from '@/rendering/ViewSettings';
import { GENE_DEFINITIONS } from '@/shared/genes';
import type { StatsSample } from '@/shared/snapshot';
import { CHART_THEME, formatTime } from './charts/chartTheme';
import { formatGene } from './format';
import { MAX_RUNS, type RunComparisonStore, type RunRecord } from './RunComparisonStore';

export interface ExperimentActions {
  saveState(): void;
  loadState(file: File): void;
  addCurrentRun(): void;
}

/** Среднее значения за последние seconds секунд истории */
function recentAverage(history: readonly StatsSample[], seconds: number, pick: (sample: StatsSample) => number): number | null {
  const last = history.at(-1);
  if (!last) {
    return null;
  }
  const recent = history.filter((sample) => sample.time >= last.time - seconds);
  return recent.reduce((sum, sample) => sum + pick(sample), 0) / recent.length;
}

/**
 * Сохранение и загрузка состояния, список запусков для сравнения и таблица итогов
 */
export class ExperimentPanel {
  private readonly _root: HTMLDetailsElement;
  private readonly _runs: RunComparisonStore;
  private readonly _settings: ViewSettings;
  private readonly _list: HTMLElement;
  private readonly _table: HTMLTableElement;
  private readonly _addButton: HTMLButtonElement;
  private readonly _unsubscribers: (() => void)[] = [];
  private _history: readonly StatsSample[] = [];

  public constructor(container: HTMLElement, runs: RunComparisonStore, settings: ViewSettings, actions: ExperimentActions) {
    this._runs = runs;
    this._settings = settings;

    this._root = document.createElement('details');
    this._root.className = 'panel experiment-panel';
    const summary = document.createElement('summary');
    summary.className = 'panel__title panel__summary';
    summary.textContent = 'Эксперименты';

    const stateTitle = this._subtitle('Состояние');
    const stateRow = document.createElement('div');
    stateRow.className = 'control-panel__row';
    this._button(stateRow, 'Сохранить в файл', () => actions.saveState());
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        actions.loadState(file);
      }
      fileInput.value = '';
    });
    this._button(stateRow, 'Загрузить…', () => fileInput.click());
    stateRow.appendChild(fileInput);

    const note = document.createElement('p');
    note.className = 'panel__message';
    note.textContent = 'Файл содержит всё для точного продолжения: конфигурацию, организмы, пищу, генератор и историю.';

    const compareTitle = this._subtitle('Сравнение запусков');
    const compareRow = document.createElement('div');
    compareRow.className = 'control-panel__row';
    this._addButton = this._button(compareRow, 'Добавить текущий запуск', () => actions.addCurrentRun());

    this._list = document.createElement('ul');
    this._list.className = 'run-list';

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'run-table-wrapper';
    this._table = document.createElement('table');
    this._table.className = 'run-table';
    tableWrapper.appendChild(this._table);

    this._root.append(summary, stateTitle, stateRow, note, compareTitle, compareRow, this._list, tableWrapper);
    container.appendChild(this._root);

    this._unsubscribers.push(
      runs.subscribe(() => this._render()),
      settings.subscribe(() => this._renderTable()),
    );
    this._render();
  }

  public setHistory(history: readonly StatsSample[]): void {
    this._history = history;
    this._addButton.disabled = history.length < 2;
    this._renderTable();
  }

  public dispose(): void {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._root.remove();
  }

  private _render(): void {
    const runs = this._runs.runs;
    this._list.replaceChildren(
      ...runs.map((run) => this._runItem(run)),
    );
    if (runs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'panel__message';
      empty.textContent = `Пока пусто. Добавьте текущий запуск, измените условия и сравните графики (до ${MAX_RUNS} записей).`;
      this._list.appendChild(empty);
    }
    this._renderTable();
  }

  private _runItem(run: RunRecord): HTMLElement {
    const item = document.createElement('li');
    item.className = 'run-list__item';

    const label = document.createElement('label');
    label.className = 'run-list__label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = run.visible;
    checkbox.disabled = !run.visible && !this._runs.canShowMore;
    checkbox.title = checkbox.disabled ? 'На графиках одновременно показываются до трех запусков' : 'Показать на графиках';
    checkbox.addEventListener('change', () => this._runs.setVisible(run.id, checkbox.checked));

    const swatch = document.createElement('span');
    swatch.className = 'chart__swatch';
    swatch.style.background = run.colorSlot === null ? 'transparent' : (CHART_THEME.series[run.colorSlot] ?? 'transparent');

    const text = document.createElement('span');
    text.className = 'run-list__text';
    const name = document.createElement('span');
    name.textContent = run.name;
    const description = document.createElement('span');
    description.className = 'run-list__description';
    description.textContent = run.description;
    text.append(name, description);

    label.append(checkbox, swatch, text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'panel__close';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Удалить ${run.name}`);
    remove.addEventListener('click', () => this._runs.remove(run.id));

    item.append(label, remove);
    return item;
  }

  /** Итоги за последние 60 с модели: текущий и видимые запуски */
  private _renderTable(): void {
    const gene = this._settings.state.chartGene;
    const rows: { name: string; color: string; history: readonly StatsSample[] }[] = [
      { name: 'Текущий', color: CHART_THEME.series[0], history: this._history },
      ...this._runs.visibleRuns.map((run) => ({
        name: run.name,
        color: CHART_THEME.series[run.colorSlot!] ?? CHART_THEME.series[1],
        history: run.history,
      })),
    ];

    const head = document.createElement('thead');
    head.innerHTML = '<tr><th>Запуск</th><th>Время</th><th>Числ.</th><th>Энергия</th><th></th></tr>';
    head.querySelector('th:last-child')!.textContent = GENE_DEFINITIONS[gene].label;

    const body = document.createElement('tbody');
    for (const row of rows) {
      const population = recentAverage(row.history, 60, (sample) => sample.population);
      const energy = recentAverage(row.history, 60, (sample) => sample.averageEnergyRatio);
      const geneValue = recentAverage(row.history, 60, (sample) => sample.averageGenes[gene]);

      const tr = document.createElement('tr');
      const nameCell = document.createElement('td');
      const swatch = document.createElement('span');
      swatch.className = 'chart__swatch';
      swatch.style.background = row.color;
      nameCell.append(swatch, ` ${row.name}`);
      tr.appendChild(nameCell);

      for (const value of [
        formatTime(row.history.at(-1)?.time ?? 0),
        population === null ? '—' : String(Math.round(population)),
        energy === null ? '—' : `${Math.round(energy * 100)}%`,
        geneValue === null ? '—' : formatGene(gene, geneValue),
      ]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }

    const caption = document.createElement('caption');
    caption.textContent = 'Средние за последние 60 с';
    this._table.replaceChildren(caption, head, body);
  }

  private _subtitle(text: string): HTMLElement {
    const title = document.createElement('h3');
    title.className = 'panel__subtitle';
    title.textContent = text;
    return title;
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
