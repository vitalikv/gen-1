import type { ViewSettings } from '@/rendering/ViewSettings';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneName } from '@/shared/genes';
import { ORGANISM_STRIDE, organismGeneField, type SimulationSnapshot, type StatsSample } from '@/shared/snapshot';
import { CHART_THEME } from './charts/chartTheme';
import { Histogram } from './charts/Histogram';
import { LineChart, type LineSeries } from './charts/LineChart';
import { formatGene } from './format';
import type { RunComparisonStore } from './RunComparisonStore';

const HISTOGRAM_BINS = 20;
const HISTOGRAM_INTERVAL_MS = 250;

const formatCount = (value: number) => String(Math.round(value));

/**
 * Графики численности, пищи, рождений и смертей, энергии, сезона и генов
 * На графики численности, пищи, энергии и среднего гена накладываются выбранные запуски для сравнения
 */
export class StatsPanel {
  private readonly _root: HTMLElement;
  private readonly _settings: ViewSettings;
  private readonly _runs: RunComparisonStore;
  private readonly _geneSelect: HTMLSelectElement;
  private readonly _populationChart: LineChart;
  private readonly _foodChart: LineChart;
  private readonly _sexChart: LineChart;
  private readonly _reproductionChart: LineChart;
  private readonly _biomassChart: LineChart;
  private readonly _birthsChart: LineChart;
  private readonly _energyChart: LineChart;
  private readonly _seasonChart: LineChart;
  private readonly _geneMeanChart: LineChart;
  private readonly _geneHistogram: Histogram;
  private readonly _unsubscribers: (() => void)[] = [];
  private _history: StatsSample[] = [];
  private _snapshot: SimulationSnapshot | null = null;
  private _lastHistogramTime = -Infinity;
  private _seasonEnabled = false;

  public constructor(container: HTMLElement, settings: ViewSettings, runs: RunComparisonStore) {
    this._settings = settings;
    this._runs = runs;

    this._root = document.createElement('section');
    this._root.className = 'panel stats-panel';

    const header = document.createElement('header');
    header.className = 'panel__header';
    const title = document.createElement('h2');
    title.className = 'panel__title';
    title.textContent = 'Статистика';

    this._geneSelect = document.createElement('select');
    this._geneSelect.setAttribute('aria-label', 'Ген для графиков');
    for (const name of GENE_NAMES) {
      this._geneSelect.add(new Option(GENE_DEFINITIONS[name].label, name));
    }
    this._geneSelect.value = settings.state.chartGene;
    this._geneSelect.addEventListener('change', () => {
      settings.update({ chartGene: this._geneSelect.value as GeneName });
    });
    header.append(title, this._geneSelect);

    this._populationChart = new LineChart({ title: 'Численность', format: formatCount });
    this._foodChart = new LineChart({ title: 'Пища на карте', format: formatCount });
    this._sexChart = new LineChart({ title: 'Самцы и самки', format: formatCount });
    this._reproductionChart = new LineChart({ title: 'Взрослые и беременности', format: formatCount });
    this._biomassChart = new LineChart({ title: 'Запас растительной пищи', format: formatCount });
    this._birthsChart = new LineChart({ title: 'Рождения и смерти за 1 с', format: formatCount });
    this._energyChart = new LineChart({
      title: 'Средняя энергия',
      format: (value) => `${Math.round(value * 100)}%`,
      yMin: 0,
      yMax: 1,
    });
    this._seasonChart = new LineChart({
      title: 'Сезонное плодородие',
      format: (value) => `${Math.round(value * 100)}%`,
      yMin: 0,
      yMax: 2,
    });
    this._seasonChart.element.hidden = true;
    this._geneMeanChart = new LineChart({ title: '', format: (value) => value.toFixed(1) });
    this._geneHistogram = new Histogram('');

    this._root.append(
      header,
      this._populationChart.element,
      this._sexChart.element,
      this._reproductionChart.element,
      this._biomassChart.element,
      this._foodChart.element,
      this._birthsChart.element,
      this._energyChart.element,
      this._seasonChart.element,
      this._geneMeanChart.element,
      this._geneHistogram.element,
    );
    container.appendChild(this._root);

    this._applyGene();
    this._unsubscribers.push(
      settings.subscribe((state) => {
        if (state.chartGene !== this._geneSelect.value) {
          this._geneSelect.value = state.chartGene;
        }
        this._applyGene();
      }),
      runs.subscribe(() => this._renderLines()),
    );
  }

  public setHistory(history: StatsSample[]): void {
    this._history = history;
    this._renderLines();
  }

  public setSeasonEnabled(enabled: boolean): void {
    this._seasonEnabled = enabled;
    this._renderLines();
  }

  public setSnapshot(snapshot: SimulationSnapshot, now = performance.now()): void {
    this._snapshot = snapshot;
    if (now - this._lastHistogramTime >= HISTOGRAM_INTERVAL_MS) {
      this._lastHistogramTime = now;
      this._updateHistogram();
    }
  }

  public dispose(): void {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    for (const chart of [
      this._populationChart,
      this._sexChart,
      this._reproductionChart,
      this._biomassChart,
      this._foodChart,
      this._birthsChart,
      this._energyChart,
      this._seasonChart,
      this._geneMeanChart,
    ]) {
      chart.dispose();
    }
    this._geneHistogram.dispose();
    this._root.remove();
  }

  /** Ряды текущего запуска и видимых сохраненных запусков для одной метрики */
  private _compared(pick: (sample: StatsSample) => number): LineSeries[] {
    const current: LineSeries = {
      label: 'Текущий',
      color: CHART_THEME.series[0],
      times: this._history.map((sample) => sample.time),
      values: this._history.map(pick),
    };
    const runs = this._runs.visibleRuns.map((run) => ({
      label: run.name,
      color: CHART_THEME.series[run.colorSlot!] ?? CHART_THEME.series[1],
      times: run.history.map((sample) => sample.time),
      values: run.history.map(pick),
    }));
    return [current, ...runs];
  }

  private _renderLines(): void {
    const history = this._history;
    const times = history.map((sample) => sample.time);

    this._populationChart.setData(this._compared((sample) => sample.population));
    this._sexChart.setData([
      { label: 'Самцы', color: '#2879d0', times, values: history.map((sample) => sample.males) },
      { label: 'Самки', color: '#c94e91', times, values: history.map((sample) => sample.females) },
    ]);
    this._reproductionChart.setData([
      { label: 'Взрослые', color: CHART_THEME.series[0], times, values: history.map((sample) => sample.mature) },
      { label: 'Беременности', color: CHART_THEME.series[1], times, values: history.map((sample) => sample.pregnancies) },
    ]);
    this._biomassChart.setData(this._compared((sample) => sample.biomass));
    this._foodChart.setData(this._compared((sample) => sample.food));
    this._energyChart.setData(this._compared((sample) => sample.averageEnergyRatio));
    this._birthsChart.setData([
      { label: 'Рождения', color: CHART_THEME.series[0], times, values: history.map((sample) => sample.births) },
      { label: 'Смерти', color: CHART_THEME.series[1], times, values: history.map((sample) => sample.deaths) },
    ]);

    this._seasonChart.element.hidden = !this._seasonEnabled;
    if (this._seasonEnabled) {
      this._seasonChart.setData([
        { label: 'Сезон', color: CHART_THEME.series[0], times, values: history.map((sample) => sample.season) },
      ]);
    }

    this._updateGeneMean();
  }

  private _applyGene(): void {
    const gene = this._settings.state.chartGene;
    const { label, min, max } = GENE_DEFINITIONS[gene];
    this._geneMeanChart.setTitle(`Среднее: ${label.toLowerCase()}`);
    this._geneMeanChart.setOptions({ yMin: min, yMax: max, format: (value) => formatGene(gene, value) });
    this._geneHistogram.setTitle(`Распределение: ${label.toLowerCase()}`);
    this._updateGeneMean();
    this._updateHistogram();
  }

  private _updateGeneMean(): void {
    const gene = this._settings.state.chartGene;
    this._geneMeanChart.setData(this._compared((sample) => sample.averageGenes[gene]));
  }

  private _updateHistogram(): void {
    const snapshot = this._snapshot;
    if (!snapshot) {
      return;
    }
    const gene = this._settings.state.chartGene;
    const field = organismGeneField(gene);
    const values = new Float32Array(snapshot.organismIds.length);
    for (let i = 0; i < values.length; i++) {
      values[i] = snapshot.organisms[i * ORGANISM_STRIDE + field]!;
    }
    const { min, max } = GENE_DEFINITIONS[gene];
    this._geneHistogram.setData(values, min, max, HISTOGRAM_BINS, (value) => formatGene(gene, value));
  }
}
