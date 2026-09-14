# gen-1

Лаборатория эволюционных агентов. Концепция и план: [docs/gen-1-concept.md](docs/gen-1-concept.md).

## Команды

```bash
npm install
npm run dev        # dev-сервер Vite
npm run typecheck  # проверка типов (app / worker / node)
npm test           # тесты Vitest
npm run build      # проверка типов и сборка в dist/
```

## Структура

```text
src/
  app/           # App и запуск
  core/          # ContextSingleton, SeededRandom, конфигурация по умолчанию
  simulation/    # SimulationEngine, World, Organism, Genome, SpatialIndex, системы; без Three.js и DOM
  worker/        # точка входа Worker, SimulationRuntime, SimulationBridge
  rendering/     # SceneManager, WorldRenderer, CameraController
  ui/            # панель управления, инспектор, графики
  shared/        # конфигурация модели, гены, формат снимков, протокол
```

## Управление

- Перетаскивание — перемещение карты, колесо — масштаб.
- Щелчок по организму — инспектор; × в инспекторе снимает выбор.

Параметры модели по умолчанию — `src/core/config.ts`, диапазоны генов — `src/shared/genes.ts`.

Код в `src/simulation` и потока Worker проверяется через `tsconfig.worker.json` без библиотеки DOM. `SimulationBridge` работает в главном потоке.
