import { startApp } from './ui/app.ts';

const target = document.getElementById('app');
if (!target) throw new Error('Pubby: #app element missing');

startApp(target);
