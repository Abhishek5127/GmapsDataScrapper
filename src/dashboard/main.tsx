import React from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from './dashboard';
import { ToastProvider } from '@/components/Toast';
import '@/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  </React.StrictMode>,
);
