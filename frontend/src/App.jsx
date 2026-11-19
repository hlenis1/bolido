import React, { useState } from 'react';
import AuthPage from './pages/AuthPage';
import AdminDashboard from './pages/AdminDashboard';
import PassengerDashboard from './pages/PassengerDashboard';
import DriverDashboard from './pages/DriverDashboard';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('bolido_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogout = () => {
    localStorage.removeItem('bolido_token');
    localStorage.removeItem('bolido_user');
    setUser(null);
  };

  if (!user) return <AuthPage onLogin={setUser} />;
  if (user.rol === 'ADMIN') return <AdminDashboard user={user} onLogout={handleLogout} />;
  if (user.rol === 'CONDUCTOR') return <DriverDashboard user={user} onLogout={handleLogout} />;
  return <PassengerDashboard user={user} onLogout={handleLogout} />;
}
