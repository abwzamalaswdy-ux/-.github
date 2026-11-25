import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {applyHighContrastMode, loadHighContrastPref} from './utils/ledgerLogic';

applyHighContrastMode(loadHighContrastPref());

createRoot(document.getElementById('root')!).render(<App />);
