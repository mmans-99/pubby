import { mount } from 'svelte';
import App from './ui/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Pubby: #app element missing');

export default mount(App, { target });
