import React from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from './settings';
import { ToastProvider } from '@/components/Toast';
import '@/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <Settings />
    </ToastProvider>
  </React.StrictMode>,
);
