import { GENE_NAMES, type GeneValues } from '@/shared/genes';
import type { StatsSample } from '@/shared/snapshot';
import type { World } from './World';

/**
 * Метрики популяции и история эксперимента
 */
export class StatisticsCollector {
  private readonly _sampleEverySteps: number;
  private readonly _maxSamples: number;
  private readonly _samples: StatsSample[] = [];
  private _lastBirths = 0;
  private _lastDeaths = 0;
  private _version = 0;

  public constructor(sampleEverySteps: number, maxSamples: number) {
    this._sampleEverySteps = Math.max(1, Math.round(sampleEverySteps));
    this._maxSamples = maxSamples;
  }

  public get history(): readonly StatsSample[] {
    return this._samples;
  }

  /** Растет при каждом изменении истории */
  public get version(): number {
    return this._version;
  }

  public reset(world: World): void {
    this._samples.length = 0;
    this._lastBirths = world.birthsTotal;
    this._lastDeaths = world.deathsTotal;
    this._version++;
    this._addSample(world, 0);
  }

  public record(world: World, step: number, time: number): void {
    if (step % this._sampleEverySteps === 0) {
      this._addSample(world, time);
    }
  }

  private _addSample(world: World, time: number): void {
    const averageGenes = {} as GeneValues;
    for (const name of GENE_NAMES) {
      averageGenes[name] = 0;
    }

    let energyRatioSum = 0;
    for (const organism of world.organisms) {
      energyRatioSum += organism.energyRatio;
      for (const name of GENE_NAMES) {
        averageGenes[name] += organism.genome.get(name);
      }
    }

    const population = world.organisms.length;
    if (population > 0) {
      for (const name of GENE_NAMES) {
        averageGenes[name] /= population;
      }
    }

    this._samples.push({
      time,
      population,
      food: world.food.length,
      births: world.birthsTotal - this._lastBirths,
      deaths: world.deathsTotal - this._lastDeaths,
      averageEnergyRatio: population > 0 ? energyRatioSum / population : 0,
      averageGenes,
    });
    this._lastBirths = world.birthsTotal;
    this._lastDeaths = world.deathsTotal;

    if (this._samples.length > this._maxSamples) {
      this._samples.shift();
    }
    this._version++;
  }
}
