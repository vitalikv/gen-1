import { SimulationEngine } from '@/simulation/SimulationEngine';
import type { SimulationCommand, SimulationResponse } from '@/shared/protocol';
import { SimulationRuntime } from './SimulationRuntime';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(response: SimulationResponse): void {
  scope.postMessage(response);
}

const runtime = new SimulationRuntime(SimulationEngine.inst('simulation'), send);

scope.addEventListener('message', (event: MessageEvent<SimulationCommand>) => {
  try {
    runtime.handleCommand(event.data);
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
