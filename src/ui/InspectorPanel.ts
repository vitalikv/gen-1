import { GENE_DEFINITIONS, GENE_NAMES, normalizeGene } from '@/shared/genes';
import type { OrganismDetails } from '@/shared/snapshot';
import { ACTION_LABELS, formatGene } from './format';

/**
 * Инспектор выбранного организма
 */
export class InspectorPanel {
  private readonly _root: HTMLElement;
  private readonly _title: HTMLElement;
  private readonly _body: HTMLElement;

  public constructor(container: HTMLElement, onClose: () => void) {
    this._root = document.createElement('section');
    this._root.className = 'panel inspector-panel';
    this._root.hidden = true;

    const header = document.createElement('header');
    header.className = 'panel__header';
    this._title = document.createElement('h2');
    this._title.className = 'panel__title';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'panel__close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Снять выбор');
    closeButton.addEventListener('click', onClose);
    header.append(this._title, closeButton);

    this._body = document.createElement('div');
    this._root.append(header, this._body);
    container.appendChild(this._root);
  }

  public show(id: number): void {
    this._root.hidden = false;
    this._title.textContent = `Организм #${id}`;
    this._body.replaceChildren(this._message('Загрузка…'));
  }

  public hide(): void {
    this._root.hidden = true;
  }

  public setDetails(id: number, details: OrganismDetails | null): void {
    this._title.textContent = `Организм #${id}`;

    if (!details) {
      this._body.replaceChildren(this._message('Организм погиб'));
      return;
    }

    const list = document.createElement('dl');
    list.className = 'inspector-panel__list';
    const add = (label: string, value: string) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      list.append(term, description);
    };

    add('Пол', details.life.sex === 'male' ? 'Мужской ♂' : 'Женский ♀');
    add('Мать', details.parentId === null ? '—' : `#${details.parentId}`);
    add('Отец', details.life.fatherId === null ? '—' : `#${details.life.fatherId}`);
    add('Стадия', details.mature ? 'Взрослый' : 'Детёныш');
    add('Рост', `${Math.round(details.life.growth * 100)}%`);
    add('Здоровье', `${Math.round(details.life.health * 100)}%`);
    add('Выносливость', `${Math.round(details.life.stamina * 100)}%`);
    add('Пища в желудке', details.life.stomach.toFixed(1));
    add('Восстановление', `${details.life.recovery.toFixed(1)} с`);
    if (details.life.pregnancy) add('До рождения', details.life.pregnancy.remaining > 0
      ? `${details.life.pregnancy.remaining.toFixed(1)} с` : 'Ожидание места в популяции');
    add('Поколение', String(details.generation));
    add('Возраст', `${details.age.toFixed(1)} с`);
    add('Энергия', `${details.energy.toFixed(0)} / ${details.capacity.toFixed(0)}`);
    add('Действие', ACTION_LABELS[details.action]);
    add('Причина', details.life.reason);

    const genes = document.createElement('div');
    genes.className = 'inspector-panel__genes';
    for (const name of GENE_NAMES) {
      const row = document.createElement('div');
      row.className = 'gene-row';
      const label = document.createElement('span');
      label.textContent = GENE_DEFINITIONS[name].label;
      const bar = document.createElement('span');
      bar.className = 'gene-row__bar';
      const fill = document.createElement('span');
      fill.className = 'gene-row__fill';
      fill.style.width = `${Math.round(normalizeGene(name, details.genes[name]) * 100)}%`;
      bar.appendChild(fill);
      const value = document.createElement('span');
      value.className = 'gene-row__value';
      value.textContent = formatGene(name, details.genes[name]);
      row.append(label, bar, value);
      genes.appendChild(row);
    }

    this._body.replaceChildren(list, genes);
  }

  private _message(text: string): HTMLElement {
    const message = document.createElement('p');
    message.className = 'panel__message';
    message.textContent = text;
    return message;
  }
}
