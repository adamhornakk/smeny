import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Trash2, Plus, Users, Car, AlertTriangle, Check, ShieldAlert } from 'lucide-react';

export default function Administration({ currentUser }) {
  // Lists
  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCars, setLoadingCars] = useState(false);

  // Form states - Users
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [addingUser, setAddingUser] = useState(false);

  // Form states - Cars
  const [carModel, setCarModel] = useState('');
  const [carSpz, setCarSpz] = useState('');
  const [carOwnerId, setCarOwnerId] = useState('');
  const [addingCar, setAddingCar] = useState(false);

  // Notifications
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch lists
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError('Chyba při načítání uživatelů: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchCars = async () => {
    setLoadingCars(true);
    try {
      const data = await api.getCars();
      setCars(data);
    } catch (err) {
      setError('Chyba při načítání aut: ' + err.message);
    } finally {
      setLoadingCars(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchCars();
  }, []);

  // Listen to real-time updates for immediate refresh
  useEffect(() => {
    const handleUpdate = () => {
      fetchUsers();
      fetchCars();
    };
    window.addEventListener('db-update', handleUpdate);
    return () => window.removeEventListener('db-update', handleUpdate);
  }, []);

  // Set default owner select when users load
  useEffect(() => {
    if (users.length > 0 && !carOwnerId) {
      setCarOwnerId(users[0].id.toString());
    }
  }, [users, carOwnerId]);

  // Handle Add User
  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!userName || !userUsername || !userPassword) {
      setError('Vyplňte prosím všechna pole pro přidání uživatele.');
      return;
    }

    setAddingUser(true);
    try {
      const newUser = await api.addUser(userUsername, userPassword, userName, userRole);
      setSuccess(`Uživatel "${newUser.name}" byl úspěšně zaregistrován.`);
      setUserName('');
      setUserUsername('');
      setUserPassword('');
      setUserRole('user');
      fetchUsers(); // Refresh list
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingUser(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (id, name) => {
    if (id === currentUser.id) {
      setError('Nemůžete smazat svůj vlastní přihlášený účet.');
      return;
    }

    if (!window.confirm(`Opravdu chcete smazat uživatele "${name}"? Tato akce zruší všechny jeho budoucí směny.`)) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      await api.deleteUser(id);
      setSuccess(`Uživatel "${name}" byl úspěšně smazán.`);
      fetchUsers();
      fetchCars(); // Owners might be re-assigned
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Add Car
  const handleAddCar = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!carModel || !carSpz || !carOwnerId) {
      setError('Vyplňte prosím model, SPZ a majitele vozu.');
      return;
    }

    setAddingCar(true);
    try {
      const newCar = await api.addCar(carModel, carSpz, carOwnerId);
      setSuccess(`Vozidlo "${newCar.model}" (${newCar.spz}) bylo úspěšně přidáno.`);
      setCarModel('');
      setCarSpz('');
      // Keep owner ID as is, or reset to first user
      if (users.length > 0) {
        setCarOwnerId(users[0].id.toString());
      }
      fetchCars();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingCar(false);
    }
  };

  // Handle Delete Car
  const handleDeleteCar = async (id, model, spz) => {
    if (!window.confirm(`Opravdu chcete smazat vozidlo "${model}" (${spz})? Tato akce zruší všechny budoucí směny tohoto vozidla.`)) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      await api.deleteCar(id);
      setSuccess(`Vozidlo "${model}" bylo úspěšně smazáno.`);
      fetchCars();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container" style={{ padding: '10px 0' }}>
      {/* Alert boxes */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: 'var(--danger)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem'
        }}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          color: 'var(--success)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem'
        }}>
          <Check size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className="admin-grid">
        {/* ==================== CARS MANAGEMENT ==================== */}
        <div className="glass-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Car /> Správa vozového parku
            </h3>
          </div>

          {/* Add Car Form */}
          <form onSubmit={handleAddCar} style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '14px', fontWeight: 600 }}>Přidat nové auto</h4>
            
            <div className="form-group">
              <label htmlFor="car-model-input">Model vozidla</label>
              <input
                id="car-model-input"
                type="text"
                className="form-control"
                placeholder="např. Škoda Octavia"
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
                required
              />
            </div>

            <div className="datetime-row">
              <div className="form-group">
                <label htmlFor="car-spz-input">Státní poznávací značka (SPZ)</label>
                <input
                  id="car-spz-input"
                  type="text"
                  className="form-control"
                  placeholder="např. 1AB 1234"
                  value={carSpz}
                  onChange={(e) => setCarSpz(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="car-owner-select">Majitel / Vlastník</label>
                <select
                  id="car-owner-select"
                  className="form-control"
                  value={carOwnerId}
                  onChange={(e) => setCarOwnerId(e.target.value)}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id.toString()}>
                      {u.name} ({u.role === 'manager' ? 'Manažer' : 'Řidič'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={addingCar}>
              <Plus size={16} /> {addingCar ? 'Ukládám...' : 'Přidat auto do systému'}
            </button>
          </form>

          {/* Cars List */}
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evidovaná auta</h4>
          {loadingCars ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Načítám auta...</p>
          ) : cars.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Žádná auta v evidenci.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>SPZ</th>
                    <th>Majitel</th>
                    <th style={{ width: '60px' }}>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {cars.map(car => (
                    <tr key={car.id}>
                      <td><strong>{car.model}</strong></td>
                      <td><code style={{ fontSize: '13px', background: 'rgba(255,255,255,0.05)' }}>{car.spz}</code></td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{car.ownerName}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-icon-only"
                          title="Smazat auto"
                          onClick={() => handleDeleteCar(car.id, car.model, car.spz)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ==================== USERS MANAGEMENT ==================== */}
        <div className="glass-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Users /> Správa uživatelských účtů
            </h3>
          </div>

          {/* Add User Form */}
          <form onSubmit={handleAddUser} style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '14px', fontWeight: 600 }}>Registrovat nového uživatele</h4>

            <div className="form-group">
              <label htmlFor="user-name-input">Jméno a příjmení</label>
              <input
                id="user-name-input"
                type="text"
                className="form-control"
                placeholder="např. Petr Svoboda"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
              />
            </div>

            <div className="datetime-row">
              <div className="form-group">
                <label htmlFor="user-username-input">Uživatelské jméno</label>
                <input
                  id="user-username-input"
                  type="text"
                  className="form-control"
                  placeholder="např. petr"
                  value={userUsername}
                  onChange={(e) => setUserUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-role-select">Role v systému</label>
                <select
                  id="user-role-select"
                  className="form-control"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  <option value="user">Řidič (Standardní uživatel)</option>
                  <option value="manager">Manažer (Plná práva)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="user-password-input">Heslo do systému</label>
              <input
                id="user-password-input"
                type="password"
                className="form-control"
                placeholder="Heslo pro první přihlášení..."
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={addingUser}>
              <Plus size={16} /> {addingUser ? 'Ukládám...' : 'Vytvořit uživatelský účet'}
            </button>
          </form>

          {/* Users List */}
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registrovaní uživatelé</h4>
          {loadingUsers ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Načítám uživatele...</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Jméno</th>
                    <th>Login</th>
                    <th>Role</th>
                    <th style={{ width: '60px' }}>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong></td>
                      <td><code style={{ fontSize: '13px', background: 'rgba(255,255,255,0.05)' }}>{u.username}</code></td>
                      <td>
                        {u.role === 'manager' ? (
                          <span style={{ color: 'var(--primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <ShieldAlert size={14} /> Manažer
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Řidič</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-icon-only"
                          title="Smazat uživatele"
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          disabled={u.id === currentUser.id}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
