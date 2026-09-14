import { CARRY_CAPACITY, type SettlementState } from '@/shared/settlement';

export class SettlementPanel {
  private readonly _root = document.createElement('section');
  private readonly _summary = document.createElement('p');
  private readonly _details = document.createElement('p');
  private readonly _choices = document.createElement('div');
  private _state: SettlementState | undefined;
  public selected = 'person';

  public constructor(container: HTMLElement, select: (id: string) => void) {
    this._root.className = 'panel'; this._root.hidden = true;
    const title = document.createElement('h2'); title.className = 'panel__title'; title.textContent = 'Первое поселение';
    const hint = document.createElement('p'); hint.className = 'panel__message';
    hint.textContent = 'Жёлтый — житель, зелёные круги — кусты, коричневый квадрат — склад. Выберите объект на карте или ниже. Запас ягод конечный; старение и смерть пока не моделируются.';
    this._details.style.whiteSpace = 'pre-line';
    this._choices.className = 'control-panel__row'; this._choices.style.flexWrap = 'wrap';
    this._choices.addEventListener('click', (event) => {
      if (event.target instanceof HTMLButtonElement && event.target.dataset.id) select(event.target.dataset.id);
    });
    this._root.append(title, this._summary, this._choices, this._details, hint); container.append(this._root);
  }

  public setState(state: SettlementState | undefined): void {
    const changed = this._state?.bushes.map((b) => b.id).join(',') !== state?.bushes.map((b) => b.id).join(',');
    this._state = state; this._root.hidden = !state;
    if (!state) return;
    if (changed || !this._choices.childElementCount) {
      this._choices.replaceChildren();
      for (const [id, label] of [['person', 'Житель'], ['store', 'Склад'], ...state.bushes.map((b) => [`bush:${b.id}`, `Куст ${b.id}`])]) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.id = id!; button.textContent = label!; this._choices.append(button);
      }
    }
    const p = state.person;
    this._summary.textContent = `Жителей: 1 · На складе: ${state.store.berries}/${state.store.capacity} ягод · Собрано: ${state.initialBerries - state.bushes.reduce((sum, b) => sum + b.berries, 0)} · Съедено: ${state.eaten}`;
    if (this.selected === 'person') {
      this._details.textContent = `${p.name} · житель №${p.id}\nГолод: ${p.hunger.toFixed(0)} / 100\nГруз: ${p.cargo} / ${CARRY_CAPACITY} ягод\n${p.reason}\nПозиция: ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;
    } else if (this.selected === 'store') {
      this._details.textContent = `Общий склад\nЯгоды: ${state.store.berries} / ${state.store.capacity}\nСвободно: ${state.store.capacity - state.store.berries}\nЖитель доставляет сюда урожай и возвращается поесть.`;
    } else {
      const bush = state.bushes.find((b) => `bush:${b.id}` === this.selected);
      this._details.textContent = bush ? `Ягодный куст №${bush.id}\nОсталось: ${bush.berries} ягод\n${bush.berries ? 'Доступен для сбора' : 'Истощён'}\nВосстановление появится на следующем этапе.` : 'Выберите объект';
    }
  }

  public dispose(): void { this._root.remove(); }
}
