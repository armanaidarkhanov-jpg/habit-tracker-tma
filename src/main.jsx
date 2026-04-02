import React from 'react';
import ReactDOM from 'react-dom/client';
import HabitTracker from './HabitTracker.jsx';

// Initialize Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HabitTracker />
  </React.StrictMode>
);
