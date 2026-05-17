import React from 'react';
import ReactDOM from 'react-dom/client';
import '../dev-mocks';
import '../index.css';
import { Popup } from './Popup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
