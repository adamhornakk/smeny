import React, { useState, useEffect } from 'react';
import { api } from './api';
import Login from './components/Login';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import Administration from './components/Administration';
import { LogOut, Calendar, LayoutDashboard, Settings, Car, Lock } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [queueCount, setQueueCount] = useState(0);

  // Password change state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('Nové heslo a potvrzení se neshodují.');
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError('Nové heslo musí mít alespoň 4 znaky.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPasswordSuccess('Heslo bylo úspěšně změněno.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (err) {
      setPasswordError(err.message || 'Nepodařilo se změnit heslo.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Authenticate user on mount if token exists
  useEffect(() => {
    const authenticateToken = async () => {
      const token = localStorage.getItem('smeny_token');
      if (token) {
        try {
          const data = await api.getMe();
          setUser(data.user);
          // Set initial tab based on role
          setActiveTab('dashboard');
        } catch (err) {
          console.warn('Nepodařilo se automaticky přihlásit:', err);
          api.logout();
        }
      }
      setLoading(false);
    };
    authenticateToken();
  }, []);

  // Fetch pending approval count for managers to show badge in navigation tab
  useEffect(() => {
    if (!user || user.role !== 'manager') return;

    const fetchQueueCount = async () => {
      try {
        const shifts = await api.getShifts();
        const pendingCount = shifts.filter(s => 
          s.status === 'pending_create' || s.status === 'pending_cancel'
        ).length;
        setQueueCount(pendingCount);
      } catch (err) {
        console.error('Nepodařilo se zjistit počet žádostí:', err);
      }
    };

    fetchQueueCount();
    
    // Fallback polling to keep in sync
    const interval = setInterval(fetchQueueCount, 20000);
    
    // Listen to real-time updates for immediate refresh
    const handleLiveUpdate = () => {
      fetchQueueCount();
    };
    window.addEventListener('db-update', handleLiveUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('db-update', handleLiveUpdate);
    };
  }, [user]);

  // Set up EventSource for real-time live updates
  useEffect(() => {
    if (!user) return;

    const source = new EventSource('/api/live');

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          // Dispatch custom event to notify all components
          window.dispatchEvent(new Event('db-update'));
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    source.onerror = (err) => {
      console.warn('SSE spojení přerušeno, probíhá pokus o znovupřipojení.', err);
    };

    return () => {
      source.close();
    };
  }, [user]);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setActiveTab('dashboard');
    setQueueCount(0);
  };

  const handleQueueCountChange = (count) => {
    setQueueCount(count);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0b0f19',
        color: '#e2e8f0',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Car size={48} className="pwa-icon-glow" style={{ color: '#6366f1', animation: 'pulse 1.5s infinite' }} />
          <p style={{ marginTop: '16px', fontSize: '0.9rem', letterSpacing: '0.05em', color: '#94a3b8' }}>
            Načítám aplikaci...
          </p>
        </div>
      </div>
    );
  }

  // Not logged in -> Render login screen
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header bar */}
      <header className="app-header">
        <div className="header-container">
          <div className="header-brand">
            <Car size={24} style={{ color: '#6366f1' }} />
            <span>Správa Směn</span>
          </div>

          <div className="user-nav-profile">
            <div className="user-info-text">
              <span className="user-name">{user.name}</span>
              <span className="user-role-label">
                {user.role === 'manager' ? 'Manažer' : 'Řidič'}
              </span>
            </div>
            
            <button 
              className="btn btn-secondary btn-icon-only" 
              onClick={() => {
                setPasswordError('');
                setPasswordSuccess('');
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowChangePasswordModal(true);
              }} 
              title="Změnit heslo"
              style={{ padding: '8px', marginRight: '8px' }}
            >
              <Lock size={18} />
            </button>

            <button 
              className="btn btn-secondary btn-icon-only" 
              onClick={handleLogout} 
              title="Odhlásit se"
              style={{ padding: '8px' }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main app body */}
      <main style={{ flex: '1', padding: '20px 0' }}>
        <div className="container">
          {/* PWA installation prompt */}
          <PwaInstallPrompt />

          {/* Navigation Tabs */}
          <nav className="nav-tabs">
            <div 
              className={`nav-tab-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Nástěnka</span>
              {user.role === 'manager' && queueCount > 0 && (
                <span className="badge-count">{queueCount}</span>
              )}
            </div>
            
            <div 
              className={`nav-tab-item ${activeTab === 'calendar' ? 'active' : ''}`}
              onClick={() => setActiveTab('calendar')}
            >
              <Calendar size={18} />
              <span>Rozpis směn</span>
            </div>

            {user.role === 'manager' && (
              <div 
                className={`nav-tab-item ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={() => setActiveTab('admin')}
              >
                <Settings size={18} />
                <span>Správa</span>
              </div>
            )}
          </nav>

          {/* Tab content rendering */}
          {activeTab === 'dashboard' && (
            <Dashboard 
              user={user} 
              onQueueCountChange={handleQueueCountChange} 
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView 
              currentUser={user} 
            />
          )}

          {activeTab === 'admin' && user.role === 'manager' && (
            <Administration 
              currentUser={user} 
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>© {new Date().getFullYear()} Správa Směn Vozidel. Progressive Web App.</p>
      </footer>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Změna hesla</h3>
              <button 
                className="modal-close-btn" 
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setPasswordError('');
                  setPasswordSuccess('');
                  setOldPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body" style={{ marginTop: '10px' }}>
                {passwordError && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'var(--danger)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    marginBottom: '14px'
                  }}>
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    color: 'var(--success)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    marginBottom: '14px'
                  }}>
                    {passwordSuccess}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="old-password">Stávající heslo</label>
                  <input
                    id="old-password"
                    type="password"
                    className="form-control"
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    required
                    disabled={passwordLoading}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-password">Nové heslo</label>
                  <input
                    id="new-password"
                    type="password"
                    className="form-control"
                    placeholder="Minimálně 4 znaky"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    disabled={passwordLoading}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label htmlFor="confirm-password">Potvrzení nového hesla</label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="form-control"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    disabled={passwordLoading}
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '12px' }} 
                  disabled={passwordLoading}
                >
                  {passwordLoading ? 'Ukládám...' : 'Změnit heslo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
