import React from 'react';
import ReactDOM from 'react-dom/client';
import { Popup } from './popup';
import { ToastProvider } from '@/components/Toast';
import '@/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <Popup />
    </ToastProvider>
  </React.StrictMode>,
);
