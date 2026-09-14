import { GENE_NAMES, type GeneValues } from '@/shared/genes';
import type { SavedSimulationState } from '@/shared/savedState';
import type { StatsSample } from '@/shared/snapshot';
import type { Organism } from './Organism';
import type { World } from './World';
import { isMature } from './systems/EvolutionSystem';

/** Средние значения генов группы; нули для пустой группы */
function averageGenesOf(organisms: readonly Organism[]): GeneValues {
  const average = {} as GeneValues;
  for (const name of GENE_NAMES) {
    average[name] = 0;
    for (const organism of organisms) average[name] += organism.genome.get(name);
    if (organisms.length > 0) average[name] /= organisms.length;
  }
  return average;
}

/**
 * Метрики популяции и история эксперимента
 */
export class StatisticsCollector {
  private readonly _sampleEverySteps: number;
  private readonly _maxSamples: number;
  private readonly _samples: StatsSample[] = [];
  private _lastBirths = 0;
  private _lastDeaths = 0;
  private _lastKills = 0;
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
    this._lastKills = world.killsTotal;
    this._version++;
    this._addSample(world, 0);
  }

  public record(world: World, step: number, time: number): void {
    if (step % this._sampleEverySteps === 0) {
      this._addSample(world, time);
    }
  }

  public toSaved(): SavedSimulationState['statistics'] {
    return { samples: structuredClone(this._samples), lastBirths: this._lastBirths, lastDeaths: this._lastDeaths,
      lastKills: this._lastKills };
  }

  public restore(saved: SavedSimulationState['statistics']): void {
    this._samples.length = 0;
    this._samples.push(...structuredClone(saved.samples).slice(-this._maxSamples));
    this._lastBirths = saved.lastBirths;
    this._lastDeaths = saved.lastDeaths;
    this._lastKills = saved.lastKills;
    this._version++;
  }

  private _addSample(world: World, time: number): void {
    const averageGenes = averageGenesOf(world.organisms.filter((organism) => !organism.isPredator));
    const predators = world.organisms.filter((organism) => organism.isPredator);
    const averagePredatorGenes = averageGenesOf(predators);

    let energyRatioSum = 0;
    for (const organism of world.organisms) {
      energyRatioSum += organism.energyRatio;
    }
    const population = world.organisms.length;

    this._samples.push({
      time,
      population,
      predators: predators.length,
      kills: world.killsTotal - this._lastKills,
      averagePredatorGenes,
      food: world.food.filter((food) => !food.eaten).length,
      males: world.organisms.filter((organism) => organism.sex === 'male').length,
      females: world.organisms.filter((organism) => organism.sex === 'female').length,
      mature: world.organisms.filter((organism) => isMature(world, organism)).length,
      pregnancies: world.organisms.filter((organism) => organism.life.pregnancy !== null).length,
      starving: world.organisms.filter((organism) => organism.energy <= 0).length,
      biomass: world.food.reduce((sum, food) => sum + food.energy, 0),
      births: world.birthsTotal - this._lastBirths,
      deaths: world.deathsTotal - this._lastDeaths,
      averageEnergyRatio: population > 0 ? energyRatioSum / population : 0,
      averageGenes,
      season: world.environment.seasonMultiplier(time),
    });
    this._lastBirths = world.birthsTotal;
    this._lastDeaths = world.deathsTotal;
    this._lastKills = world.killsTotal;

    if (this._samples.length > this._maxSamples) {
      this._samples.shift();
    }
    this._version++;
  }
}
