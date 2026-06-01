import React from 'react';
import ReactDOM from 'react-dom/client';
import '../dev-mocks';
import '../index.css';
import { Popup } from './Popup';
import { ErrorBoundary } from '@/components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  </React.StrictMode>
);
