import React from 'react';
import ReactDOM from 'react-dom/client';
import { initRum } from '@keepnum/shared';
import App from './App';

// Initialize CloudWatch RUM for real user monitoring
initRum();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
