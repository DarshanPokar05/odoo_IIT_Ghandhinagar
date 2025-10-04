import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import CreateExpense from './pages/CreateExpense';
import Approvals from './pages/Approvals';
import Users from './pages/Users';
import Settings from './pages/Settings';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="expenses/new" element={<CreateExpense />} />
            <Route path="expenses/:id/edit" element={<CreateExpense />} />
            {(user.role === 'manager' || user.role === 'admin') && (
              <Route path="approvals" element={<Approvals />} />
            )}
            {user.role === 'admin' && (
              <>
                <Route path="users" element={<Users />} />
                <Route path="settings" element={<Settings />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </div>
  );
}

export default App;