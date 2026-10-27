import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            fontSize: '0.8125rem',
          },
          success: { iconTheme: { primary: '#34d399', secondary: 'transparent' } },
          error: { iconTheme: { primary: '#f87171', secondary: 'transparent' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
