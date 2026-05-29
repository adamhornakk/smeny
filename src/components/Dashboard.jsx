import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { formatDateTime, getStatusBadge } from '../utils';
import { Calendar, Plus, FileText, Check, X, ClipboardList, Info, AlertTriangle, Car } from 'lucide-react';

export default function Dashboard({ user, onQueueCountChange }) {
  // Common states
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // User states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('16:00');
  
  const [cars, setCars] = useState([]);
  const [selectedCarId, setSelectedCarId] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [myShifts, setMyShifts] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [submittingShift, setSubmittingShift] = useState(false);

  // Notes editing states
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [editingNotesText, setEditingNotesText] = useState('');

  // Manager states
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  // Manager editing queue times
  const [editingQueueId, setEditingQueueId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTimeFrom, setEditTimeFrom] = useState('');
  const [editTimeTo, setEditTimeTo] = useState('');

  // Sync separate date and times to ISO dateFrom and dateTo
  useEffect(() => {
    if (!shiftDate || !timeFrom || !timeTo) return;
    const combinedFrom = `${shiftDate}T${timeFrom}`;
    let combinedTo = `${shiftDate}T${timeTo}`;
    
    // Handle night shifts (if timeTo <= timeFrom, it ends the next day)
    if (timeTo <= timeFrom) {
      const d = new Date(shiftDate);
      d.setDate(d.getDate() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      combinedTo = `${yyyy}-${mm}-${dd}T${timeTo}`;
    }
    
    setDateFrom(combinedFrom);
    setDateTo(combinedTo);
  }, [shiftDate, timeFrom, timeTo]);

  const startEditingQueueTime = (shift) => {
    setEditingQueueId(shift.id);
    setEditDate(shift.dateFrom.split('T')[0]);
    setEditTimeFrom(shift.dateFrom.split('T')[1]);
    setEditTimeTo(shift.dateTo.split('T')[1]);
  };

  const handleSaveQueueTime = async (shiftId) => {
    setError('');
    setSuccess('');
    try {
      const combinedFrom = `${editDate}T${editTimeFrom}`;
      let combinedTo = `${editDate}T${editTimeTo}`;
      
      if (editTimeTo <= editTimeFrom) {
        const d = new Date(editDate);
        d.setDate(d.getDate() + 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        combinedTo = `${yyyy}-${mm}-${dd}T${editTimeTo}`;
      }
      
      await api.updateShiftTimes(shiftId, combinedFrom, combinedTo);
      setEditingQueueId(null);
      loadData();
      setSuccess('Čas směny byl úspěšně upraven.');
    } catch (err) {
      setError('Nepodařilo se upravit čas: ' + err.message);
    }
  };

  // Initialize dates: Tomorrow from 08:00 to 16:00
  useEffect(() => {
    if (user.role === 'user') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      
      setShiftDate(`${yyyy}-${mm}-${dd}`);
      setTimeFrom('08:00');
      setTimeTo('16:00');
    }
  }, [user]);

  // Load shifts for users OR queue for managers
  const loadData = async () => {
    setError('');
    if (user.role === 'manager') {
      setLoadingQueue(true);
      try {
        const allShifts = await api.getShifts();
        const pendingShifts = allShifts.filter(s => 
          s.status === 'pending_create' || s.status === 'pending_cancel'
        );
        setQueue(pendingShifts);
        if (onQueueCountChange) {
          onQueueCountChange(pendingShifts.length);
        }
      } catch (err) {
        setError('Nepodařilo se načíst frontu schvalování: ' + err.message);
      } finally {
        setLoadingQueue(false);
      }
    } else {
      setLoadingShifts(true);
      try {
        const allShifts = await api.getShifts();
        const userShifts = allShifts.filter(s => s.userId === user.id);
        // Sort: newest first
        userShifts.sort((a, b) => new Date(b.dateFrom) - new Date(a.dateFrom));
        setMyShifts(userShifts);
      } catch (err) {
        setError('Nepodařilo se načíst vaše směny: ' + err.message);
      } finally {
        setLoadingShifts(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Listen to real-time updates for immediate refresh
  useEffect(() => {
    const handleUpdate = () => {
      loadData();
      if (user.role === 'user' && dateFrom && dateTo) {
        api.getCarsAvailability(dateFrom, dateTo)
          .then(availableCars => {
            const sorted = [...availableCars].sort((a, b) => {
              const aIsMine = a.ownerId === user.id;
              const bIsMine = b.ownerId === user.id;
              if (aIsMine && !bIsMine) return -1;
              if (!aIsMine && bIsMine) return 1;
              return 0;
            });
            setCars(sorted);
          })
          .catch(err => console.error('Chyba při zjišťování dostupnosti aut v reálném čase:', err));
      }
    };
    window.addEventListener('db-update', handleUpdate);
    return () => window.removeEventListener('db-update', handleUpdate);
  }, [dateFrom, dateTo, user]);

  // Fetch car availability when dates change
  useEffect(() => {
    if (user.role !== 'user' || !dateFrom || !dateTo) return;

    const fromTime = new Date(dateFrom);
    const toTime = new Date(dateTo);

    if (isNaN(fromTime) || isNaN(toTime)) return;
    if (fromTime >= toTime) {
      setCars([]);
      setSelectedCarId('');
      return;
    }

    const fetchAvailability = async () => {
      setLoadingAvailability(true);
      try {
        const availableCars = await api.getCarsAvailability(dateFrom, dateTo);
        // Sort: user's owned cars first
        const sorted = [...availableCars].sort((a, b) => {
          const aIsMine = a.ownerId === user.id;
          const bIsMine = b.ownerId === user.id;
          if (aIsMine && !bIsMine) return -1;
          if (!aIsMine && bIsMine) return 1;
          return 0;
        });
        setCars(sorted);
        // Deselect if currently selected car becomes unavailable
        const selectedCar = sorted.find(c => c.id === parseInt(selectedCarId, 10));
        if (!selectedCar || !selectedCar.isAvailable) {
          setSelectedCarId('');
        }
      } catch (err) {
        console.error('Chyba při zjišťování dostupnosti aut:', err);
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [dateFrom, dateTo, selectedCarId, user]);

  // Handle Shift Request submission
  const handleRequestShift = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedCarId) {
      setError('Vyberte prosím dostupné auto.');
      return;
    }

    const fromTime = new Date(dateFrom);
    const toTime = new Date(dateTo);
    if (fromTime >= toTime) {
      setError('Čas konce musí být po času začátku.');
      return;
    }

    setSubmittingShift(true);
    try {
      await api.requestShift(selectedCarId, dateFrom, dateTo, shiftNotes);
      setSuccess('Žádost o směnu byla odeslána ke schválení manažerovi.');
      setShiftNotes('');
      // Reload shifts and re-query availability
      loadData();
      // Re-trigger availability list refresh
      const availableCars = await api.getCarsAvailability(dateFrom, dateTo);
      const sorted = [...availableCars].sort((a, b) => {
        const aIsMine = a.ownerId === user.id;
        const bIsMine = b.ownerId === user.id;
        if (aIsMine && !bIsMine) return -1;
        if (!aIsMine && bIsMine) return 1;
        return 0;
      });
      setCars(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingShift(false);
    }
  };

  // Handle User Notes Edit initiation
  const startEditingNotes = (shift) => {
    setEditingShiftId(shift.id);
    setEditingNotesText(shift.notes);
  };

  const saveNotes = async (shiftId) => {
    try {
      await api.updateShiftNotes(shiftId, editingNotesText);
      setEditingShiftId(null);
      loadData(); // reload
    } catch (err) {
      setError('Nepodařilo se uložit poznámku: ' + err.message);
    }
  };

  // Handle User cancellation request
  const handleCancelRequest = async (shiftId) => {
    setError('');
    setSuccess('');
    try {
      await api.updateShiftStatus(shiftId, 'pending_cancel');
      setSuccess('Žádost o zrušení směny byla odeslána ke schválení.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Manager decisions
  const handleManagerDecision = async (shiftId, newStatus) => {
    setError('');
    setActioningId(shiftId);
    try {
      await api.updateShiftStatus(shiftId, newStatus);
      setSuccess(newStatus === 'approved' 
        ? 'Směna byla úspěšně schválena.' 
        : 'Žádost byla úspěšně zamítnuta/zrušena.'
      );
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="container" style={{ padding: '10px 0' }}>
      {/* Alert Notices */}
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

      {user.role === 'manager' ? (
        /* ==================== MANAGER DASHBOARD ==================== */
        <div className="dashboard-grid full-width">
          <div className="glass-panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <ClipboardList /> Fronta schvalování ({queue.length})
              </h3>
            </div>

            {loadingQueue ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Načítám žádosti...</p>
            ) : queue.length === 0 ? (
              <div className="no-items-placeholder">
                <Info size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>Žádné nevyřízené žádosti ke schválení.</p>
              </div>
            ) : (
              <div className="queue-list">
                {queue.map((shift) => {
                  const isCancel = shift.status === 'pending_cancel';
                  return (
                    <div 
                      key={shift.id} 
                      className={`queue-card ${isCancel ? 'cancel-request' : 'create-request'}`}
                    >
                      <div className="queue-card-meta">
                        <span className="queue-card-user">{shift.userName}</span>
                        {isCancel 
                          ? <span className="badge badge-cancel-pending">Žádost o Zrušení</span>
                          : <span className="badge badge-pending">Nová Směna</span>
                        }
                      </div>

                      <div className="queue-card-car" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Car size={16} style={{ color: 'var(--primary)' }} />
                        <span>{shift.car ? `${shift.car.model} (${shift.car.spz})` : 'Smazané auto'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          (Majitel: {shift.car?.ownerName})
                        </span>
                      </div>

                      {editingQueueId === shift.id ? (
                        <div style={{
                          padding: '12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          marginBottom: '12px',
                          marginTop: '8px'
                        }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px', color: 'var(--primary)' }}>
                            Upravit čas směny
                          </span>
                          <div className="form-group" style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '0.7rem' }}>Datum</label>
                            <input
                              type="date"
                              className="form-control"
                              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="form-group" style={{ flex: 1, marginBottom: '10px' }}>
                              <label style={{ fontSize: '0.7rem' }}>Od (24h)</label>
                              <input
                                type="time"
                                step="60"
                                className="form-control"
                                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                value={editTimeFrom}
                                onChange={(e) => setEditTimeFrom(e.target.value)}
                              />
                            </div>
                            <div className="form-group" style={{ flex: 1, marginBottom: '10px' }}>
                              <label style={{ fontSize: '0.7rem' }}>Do (24h)</label>
                              <input
                                type="time"
                                step="60"
                                className="form-control"
                                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                value={editTimeTo}
                                onChange={(e) => setEditTimeTo(e.target.value)}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-success"
                              style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1 }}
                              onClick={() => handleSaveQueueTime(shift.id)}
                            >
                              Uložit čas
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1 }}
                              onClick={() => setEditingQueueId(null)}
                            >
                              Zrušit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="queue-card-time">
                            <Calendar size={14} />
                            <span>Od: {formatDateTime(shift.dateFrom)}</span>
                          </div>
                          <div className="queue-card-time" style={{ marginTop: '-4px' }}>
                            <Calendar size={14} style={{ opacity: 0 }} />
                            <span>Do: {formatDateTime(shift.dateTo)}</span>
                          </div>
                        </>
                      )}

                      {shift.notes && (
                        <div className="queue-card-note">
                          <strong>Poznámka řidiče:</strong> {shift.notes}
                        </div>
                      )}

                      <div className="queue-card-btns">
                        {isCancel ? (
                          <>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleManagerDecision(shift.id, 'cancelled')}
                              disabled={actioningId === shift.id}
                            >
                              <Check size={16} /> Potvrdit zrušení
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleManagerDecision(shift.id, 'approved')}
                              disabled={actioningId === shift.id}
                            >
                              <X size={16} /> Zamítnout zrušení
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-success"
                              onClick={() => handleManagerDecision(shift.id, 'approved')}
                              disabled={actioningId === shift.id || editingQueueId === shift.id}
                            >
                              <Check size={16} /> Schválit směnu
                            </button>
                            {editingQueueId !== shift.id && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => startEditingQueueTime(shift)}
                                disabled={actioningId === shift.id}
                              >
                                Upravit čas
                              </button>
                            )}
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleManagerDecision(shift.id, 'cancelled')}
                              disabled={actioningId === shift.id || editingQueueId === shift.id}
                            >
                              <X size={16} /> Zamítnout
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== USER DASHBOARD ==================== */
        <div className="dashboard-grid">
          {/* Left Side: Request Shift */}
          <div className="glass-panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Plus /> Zažádat o novou směnu
              </h3>
            </div>

            <form onSubmit={handleRequestShift}>
              <div className="form-group">
                <label htmlFor="shift-date">Datum směny</label>
                <input
                  id="shift-date"
                  type="date"
                  className="form-control"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  required
                />
              </div>

              <div className="datetime-row">
                <div className="form-group">
                  <label htmlFor="shift-time-from">Čas začátku (Od)</label>
                  <input
                    id="shift-time-from"
                    type="time"
                    step="60"
                    className="form-control"
                    value={timeFrom}
                    onChange={(e) => setTimeFrom(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="shift-time-to">Čas konce (Do)</label>
                  <input
                    id="shift-time-to"
                    type="time"
                    step="60"
                    className="form-control"
                    value={timeTo}
                    onChange={(e) => setTimeTo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Výběr vozidla (Dostupná auta)</label>
                {loadingAvailability ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '10px' }}>
                    Ověřuji obsazenost vozidel...
                  </p>
                ) : cars.length === 0 ? (
                  <p style={{ color: 'var(--warning)', fontSize: '0.85rem', padding: '10px' }}>
                    Pro zobrazení aut zadejte platný časový rozsah (konec musí být po začátku).
                  </p>
                ) : (
                  <div className="available-cars-list">
                    {cars.map((car) => {
                      const isSelected = selectedCarId === car.id.toString();
                      const isMine = car.ownerId === user.id;
                      
                      return (
                        <div
                          key={car.id}
                          className={`car-radio-card ${!car.isAvailable ? 'occupied' : ''} ${isSelected ? 'selected' : ''} ${isMine ? 'owned-by-me' : ''}`}
                          onClick={() => car.isAvailable && setSelectedCarId(car.id.toString())}
                        >
                          <div className="car-radio-left">
                            <input
                              type="radio"
                              name="selectedCar"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent div onClick
                              disabled={!car.isAvailable}
                              style={{ cursor: 'pointer' }}
                            />
                            <div className="car-radio-info">
                              <span className="car-radio-model">
                                {car.model}
                                {isMine && <span className="owned-by-me-badge">Moje vozidlo</span>}
                              </span>
                              <span className="car-radio-spz-owner">
                                SPZ: {car.spz} | Vlastník: {car.ownerName}
                              </span>
                            </div>
                          </div>

                          {!car.isAvailable && (
                            <span className="occupied-pill">
                              Obsadil/a {car.occupiedBy}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="shift-notes">Poznámky ke směně</label>
                <textarea
                  id="shift-notes"
                  className="form-control"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Popište účel jízdy (např. Rozvoz po Praze, služební cesta...)"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={submittingShift || !selectedCarId}
              >
                {submittingShift ? 'Odesílám žádost...' : 'Odeslat žádost ke schválení'}
              </button>
            </form>
          </div>

          {/* Right Side: List of My Shifts */}
          <div className="glass-panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <FileText /> Moje směny
              </h3>
            </div>

            {loadingShifts ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Načítám směny...</p>
            ) : myShifts.length === 0 ? (
              <div className="no-items-placeholder">
                <Info size={30} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p>Zatím nemáte zapsané žádné směny.</p>
              </div>
            ) : (
              <div className="shifts-list">
                {myShifts.map((shift) => (
                  <div key={shift.id} className="shift-card">
                    <div className="shift-card-header">
                      <span className="shift-card-car">
                        {shift.car ? shift.car.model : 'Smazané auto'}
                      </span>
                      {getStatusBadge(shift.status, shift.dateTo)}
                    </div>

                    <div className="shift-card-time">
                      <Calendar size={14} />
                      <span>{formatDateTime(shift.dateFrom)}</span>
                    </div>
                    <div className="shift-card-time" style={{ marginTop: '-8px' }}>
                      <Calendar size={14} style={{ opacity: 0 }} />
                      <span>{formatDateTime(shift.dateTo)}</span>
                    </div>

                    {shift.car && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        SPZ: {shift.car.spz} | Majitel: {shift.car.ownerName}
                      </p>
                    )}

                    {/* Notes Box / Note Editor */}
                    {editingShiftId === shift.id ? (
                      <div>
                        <textarea
                          className="notes-edit-area"
                          value={editingNotesText}
                          onChange={(e) => setEditingNotesText(e.target.value)}
                          placeholder="Zadejte poznámku..."
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-success"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => saveNotes(shift.id)}
                          >
                            Uložit
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => setEditingShiftId(null)}
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {shift.notes ? (
                          <div className="shift-card-notes">
                            {shift.notes}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '12px' }}>
                            Bez poznámky.
                          </p>
                        )}
                        
                        <div className="shift-card-actions">
                          {/* Allow note editing for approved/pending shifts */}
                          {(shift.status === 'approved' || shift.status === 'pending_create') && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                              onClick={() => startEditingNotes(shift)}
                            >
                              Upravit poznámku
                            </button>
                          )}
                          
                          {/* Allow cancel request only for approved shifts that are not finished yet */}
                          {shift.status === 'approved' && new Date(shift.dateTo) >= new Date() && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '6px 12px', fontSize: '0.8rem', marginLeft: 'auto' }}
                              onClick={() => handleCancelRequest(shift.id)}
                            >
                              Požádat o zrušení
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
