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
  core/          # ContextSingleton, конфигурация
  simulation/    # модель мира, без Three.js и DOM
  worker/        # точка входа Worker, SimulationBridge
  rendering/     # SceneManager и отображение
  shared/        # типы команд и ответов
```

Код в `src/simulation` и `*.worker.ts` проверяется через `tsconfig.worker.json` без библиотеки DOM.
