import './style.css';
import { App } from '@/app/App';

const container = document.querySelector<HTMLElement>('#app');
if (!container) {
  throw new Error('Не найден контейнер #app');
}

App.inst('main').start(container);
