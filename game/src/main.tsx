import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA update: register, hold the waiting worker, apply only back on the title screen.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/sw.js');
    wb.addEventListener('waiting', () => {
      sessionStorage.setItem('nom-nom-go-update-ready', '1');
    });
    void wb.register();
  });
}
