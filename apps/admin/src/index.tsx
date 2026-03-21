import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configureAmplify, initRum } from '@keepnum/shared';
import App from './App';

// Initialise Amplify Libraries with shared Cognito + API Gateway config
configureAmplify();

// Initialize CloudWatch RUM for real user monitoring
initRum();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
