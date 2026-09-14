import type { ViewSettings } from '@/rendering/ViewSettings';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneName } from '@/shared/genes';
import { ORGANISM_STRIDE, organismGeneField, type SimulationSnapshot, type StatsSample } from '@/shared/snapshot';
import { CHART_THEME } from './charts/chartTheme';
import { Histogram } from './charts/Histogram';
import { LineChart } from './charts/LineChart';
import { formatGene } from './format';

const HISTOGRAM_BINS = 20;
const HISTOGRAM_INTERVAL_MS = 250;

/**
 * Графики численности, рождений и смертей, средней энергии и распределения генов
 */
export class StatsPanel {
  private readonly _root: HTMLElement;
  private readonly _settings: ViewSettings;
  private readonly _geneSelect: HTMLSelectElement;
  private readonly _populationChart: LineChart;
  private readonly _birthsChart: LineChart;
  private readonly _energyChart: LineChart;
  private readonly _geneMeanChart: LineChart;
  private readonly _geneHistogram: Histogram;
  private readonly _unsubscribe: () => void;
  private _history: StatsSample[] = [];
  private _snapshot: SimulationSnapshot | null = null;
  private _lastHistogramTime = -Infinity;

  public constructor(container: HTMLElement, settings: ViewSettings) {
    this._settings = settings;

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

    this._populationChart = new LineChart({ title: 'Численность', format: (value) => String(Math.round(value)) });
    this._birthsChart = new LineChart({ title: 'Рождения и смерти за 1 с', format: (value) => String(Math.round(value)) });
    this._energyChart = new LineChart({
      title: 'Средняя энергия',
      format: (value) => `${Math.round(value * 100)}%`,
      yMin: 0,
      yMax: 1,
    });
    this._geneMeanChart = new LineChart({ title: '', format: (value) => value.toFixed(1) });
    this._geneHistogram = new Histogram('');

    this._root.append(
      header,
      this._populationChart.element,
      this._birthsChart.element,
      this._energyChart.element,
      this._geneMeanChart.element,
      this._geneHistogram.element,
    );
    container.appendChild(this._root);

    this._applyGene();
    this._unsubscribe = settings.subscribe((state) => {
      if (state.chartGene !== this._geneSelect.value) {
        this._geneSelect.value = state.chartGene;
      }
      this._applyGene();
    });
  }

  public setHistory(history: StatsSample[]): void {
    this._history = history;
    const times = history.map((sample) => sample.time);

    this._populationChart.setData(times, [
      { label: 'Численность', color: CHART_THEME.series[0], values: history.map((sample) => sample.population) },
    ]);
    this._birthsChart.setData(times, [
      { label: 'Рождения', color: CHART_THEME.series[0], values: history.map((sample) => sample.births) },
      { label: 'Смерти', color: CHART_THEME.series[1], values: history.map((sample) => sample.deaths) },
    ]);
    this._energyChart.setData(times, [
      { label: 'Энергия', color: CHART_THEME.series[0], values: history.map((sample) => sample.averageEnergyRatio) },
    ]);
    this._updateGeneMean();
  }

  public setSnapshot(snapshot: SimulationSnapshot, now = performance.now()): void {
    this._snapshot = snapshot;
    if (now - this._lastHistogramTime >= HISTOGRAM_INTERVAL_MS) {
      this._lastHistogramTime = now;
      this._updateHistogram();
    }
  }

  public dispose(): void {
    this._unsubscribe();
    this._populationChart.dispose();
    this._birthsChart.dispose();
    this._energyChart.dispose();
    this._geneMeanChart.dispose();
    this._geneHistogram.dispose();
    this._root.remove();
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
    this._geneMeanChart.setData(
      this._history.map((sample) => sample.time),
      [{ label: GENE_DEFINITIONS[gene].label, color: CHART_THEME.series[0], values: this._history.map((sample) => sample.averageGenes[gene]) }],
    );
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
