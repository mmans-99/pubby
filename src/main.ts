import { startApp } from './ui/app.ts';
import { registerOffline } from './ui/offline.ts';
import { blockZoom } from './ui/nozoom.ts';

const target = document.getElementById('app');
if (!target) throw new Error('Pubby: #app element missing');

startApp(target);
registerOffline();
blockZoom();
