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

  // Real-time toast notifications state
  const [toasts, setToasts] = useState([]);

  const addToast = (title, message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, message, type }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);

    // Show native browser notification if permission granted
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body: message });
      } catch (err) {
        console.error('Failed to show native notification:', err);
      }
    }
  };

  const addToastRef = React.useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  // Push Notifications state and methods
  const [showPushBanner, setShowPushBanner] = useState(false);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeUserToPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifikace nejsou v tomto prohlížeči podporovány.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Get VAPID public key from API
      const { publicKey } = await api.getVapidPublicKey();
      if (!publicKey) {
        throw new Error('Nepodařilo se získat VAPID klíč.');
      }

      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      // Send to backend
      await api.subscribePush(subscription);
      console.log('Uživatel úspěšně přihlášen k odběru push notifikací.');
    } catch (err) {
      console.error('Chyba při přihlašování k odběru push notifikací:', err);
      throw err;
    }
  };

  const handleEnablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      addToast('Nepodporováno', 'Push notifikace nejsou v tomto prohlížeči podporovány. Na iPhone musíte aplikaci nejprve přidat na plochu (Sdílet -> Přidat na plochu) a otevřít ji odtud.', 'warning');
      setShowPushBanner(false);
      return;
    }

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      addToast('Vyžadováno HTTPS', 'Push notifikace na telefonu vyžadují zabezpečené připojení (HTTPS). Pro vývoj můžete použít např. ngrok.', 'danger');
      setShowPushBanner(false);
      return;
    }

    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await subscribeUserToPush();
          addToast('Úspěch', 'Push notifikace na pozadí byly úspěšně aktivovány!', 'success');
        } else {
          addToast('Upozornění', 'Oprávnění k zasílání notifikací bylo zamítnuto.', 'warning');
        }
      }
    } catch (err) {
      console.error('Žádost o povolení notifikací selhala:', err);
      addToast('Chyba', 'Aktivace push notifikací selhala: ' + err.message, 'danger');
    } finally {
      setShowPushBanner(false);
    }
  };

  // Show push notification banner if permission is default (not yet granted)
  useEffect(() => {
    if (user && 'PushManager' in window && Notification.permission === 'default') {
      setShowPushBanner(true);
    }
  }, [user]);

  // Auto-subscribe if permission is already granted (on mount or login)
  useEffect(() => {
    if (user && 'PushManager' in window && Notification.permission === 'granted') {
      subscribeUserToPush();
    }
  }, [user]);

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

    const token = localStorage.getItem('smeny_token');
    const source = new EventSource(`/api/live?token=${encodeURIComponent(token || '')}`);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          // Dispatch custom event to notify all components
          window.dispatchEvent(new Event('db-update'));

          if (data.notification) {
            let type = 'info';
            const titleLower = data.notification.title.toLowerCase();
            if (titleLower.includes('schvál') || titleLower.includes('úspěš')) {
              type = 'success';
            } else if (titleLower.includes('zamítn') || titleLower.includes('zruš')) {
              type = 'warning';
            } else if (titleLower.includes('chyba') || titleLower.includes('nebez')) {
              type = 'danger';
            }
            addToastRef.current(data.notification.title, data.notification.body, type);
          }
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

          {/* Web Push subscription prompt */}
          {showPushBanner && (
            <div className="pwa-banner" style={{ background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)', borderColor: 'rgba(45, 212, 191, 0.3)' }}>
              <div className="pwa-content">
                <span className="pwa-icon-glow" style={{ fontSize: '1.5rem' }}>🔔</span>
                <div className="pwa-text">
                  <h4>Upozornění na pozadí</h4>
                  <p>Chcete dostávat zprávy o změnách směn i při zavřené aplikaci?</p>
                </div>
              </div>
              <div className="pwa-actions">
                <button 
                  className="btn btn-primary" 
                  onClick={handleEnablePush}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0b0f19', fontWeight: 600 }}
                >
                  Povolit
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowPushBanner(false)}
                >
                  Zavřít
                </button>
              </div>
            </div>
          )}

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
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast-item ${toast.type}`}>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>✕</button>
            <div className="toast-header">{toast.title}</div>
            <div className="toast-body">{toast.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
