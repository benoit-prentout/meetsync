import '../dev-mocks';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from './Dashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  </React.StrictMode>
);
