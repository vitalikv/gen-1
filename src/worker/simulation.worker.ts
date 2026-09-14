import { SimulationEngine } from '@/simulation/SimulationEngine';
import type { SimulationCommand, SimulationResponse } from '@/shared/protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = SimulationEngine.inst('simulation');

function send(response: SimulationResponse): void {
  scope.postMessage(response);
}

function handleCommand(command: SimulationCommand): void {
  switch (command.type) {
    case 'init':
      engine.init(command.config);
      send({ type: 'ready', step: engine.step });
      break;
  }
}

scope.addEventListener('message', (event: MessageEvent<SimulationCommand>) => {
  try {
    handleCommand(event.data);
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
