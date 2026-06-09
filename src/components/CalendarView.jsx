import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { formatDateTime, formatTime, getStatusBadge } from '../utils';
import { ChevronLeft, ChevronRight, Filter, Calendar, Clock, User, Car, X, Info } from 'lucide-react';

export default function CalendarView({ currentUser }) {
  const [shifts, setShifts] = useState([]);
  const [cars, setCars] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter states
  const [selectedCarFilter, setSelectedCarFilter] = useState('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');

  // Navigation states
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Mobile day selection
  const [mobileSelectedDate, setMobileSelectedDate] = useState(new Date());

  // Modal detail state
  const [selectedShiftDetails, setSelectedShiftDetails] = useState(null);

  // Manager editing calendar shift times
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTimeFrom, setEditTimeFrom] = useState('');
  const [editTimeTo, setEditTimeTo] = useState('');
  const [editError, setEditError] = useState('');

  // Reset editing states on modal close
  useEffect(() => {
    if (!selectedShiftDetails) {
      setIsEditingTime(false);
      setEditError('');
    }
  }, [selectedShiftDetails]);

  const reloadCalendarData = async () => {
    try {
      const loadedShifts = await api.getShifts();
      setShifts(loadedShifts.filter(s => s.status !== 'cancelled'));
    } catch (err) {
      console.error(err);
    }
  };

  const startEditingTime = () => {
    if (!selectedShiftDetails) return;
    setEditError('');
    setIsEditingTime(true);
    setEditDate(selectedShiftDetails.dateFrom.split('T')[0]);
    setEditTimeFrom(selectedShiftDetails.dateFrom.split('T')[1]);
    setEditTimeTo(selectedShiftDetails.dateTo.split('T')[1]);
  };

  const saveEditedTime = async () => {
    if (!selectedShiftDetails) return;
    setEditError('');
    try {
      const combinedFrom = `${editDate}T${editTimeFrom}`;
      let combinedTo = `${editDate}T${editTimeTo}`;
      
      if (editTimeTo <= editTimeFrom) {
        // Night shift: add 1 day to dateTo
        const d = new Date(editDate);
        d.setDate(d.getDate() + 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        combinedTo = `${yyyy}-${mm}-${dd}T${editTimeTo}`;
      }

      await api.updateShiftTimes(selectedShiftDetails.id, combinedFrom, combinedTo);
      
      setSelectedShiftDetails(prev => ({
        ...prev,
        dateFrom: combinedFrom,
        dateTo: combinedTo
      }));

      reloadCalendarData();
      setIsEditingTime(false);
    } catch (err) {
      setEditError(err.message);
    }
  };

  // Load shifts, cars, users on mount
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [loadedShifts, loadedCars, loadedUsers] = await Promise.all([
          api.getShifts(),
          api.getCars(),
          api.getUsers()
        ]);
        // Only show approved or pending shifts in the calendar, filter out cancelled
        setShifts(loadedShifts.filter(s => s.status !== 'cancelled'));
        setCars(loadedCars);
        setUsers(loadedUsers);
      } catch (err) {
        console.error('Chyba při načítání dat kalendáře:', err);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  // Listen to real-time updates for immediate refresh
  useEffect(() => {
    const handleUpdate = async () => {
      try {
        const [loadedShifts, loadedCars, loadedUsers] = await Promise.all([
          api.getShifts(),
          api.getCars(),
          api.getUsers()
        ]);
        setShifts(loadedShifts.filter(s => s.status !== 'cancelled'));
        setCars(loadedCars);
        setUsers(loadedUsers);
      } catch (err) {
        console.error('Chyba při aktualizaci kalendáře v reálném čase:', err);
      }
    };
    window.addEventListener('db-update', handleUpdate);
    return () => window.removeEventListener('db-update', handleUpdate);
  }, []);

  // Sync mobile date when current month changes
  useEffect(() => {
    // If mobile selected date is in a different month, reset it to the 1st of current month
    if (mobileSelectedDate.getMonth() !== currentDate.getMonth() || mobileSelectedDate.getFullYear() !== currentDate.getFullYear()) {
      setMobileSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    }
  }, [currentDate]);

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Get month name in Czech
  const getCzechMonthName = (date) => {
    const months = [
      'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
      'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Apply filters to shifts
  const filteredShifts = shifts.filter(shift => {
    const carMatch = selectedCarFilter === 'all' || shift.carId.toString() === selectedCarFilter;
    const userMatch = selectedUserFilter === 'all' || shift.userId.toString() === selectedUserFilter;
    return carMatch && userMatch;
  });

  // Check if a shift overlaps with a specific day
  const getShiftsForDate = (date) => {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    return filteredShifts.filter(shift => {
      const shiftStart = new Date(shift.dateFrom);
      const shiftEnd = new Date(shift.dateTo);
      return shiftStart <= dayEnd && shiftEnd >= dayStart;
    });
  };

  // Generate days for standard calendar grid (Desktop)
  const generateGridDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of current month
    const firstDayOfMonth = new Date(year, month, 1);
    // Day of the week for the 1st of month (0 = Sunday, 1 = Monday, etc.)
    let startDayOfWeek = firstDayOfMonth.getDay();
    // Adjust for Czech calendar (Monday = 0, Sunday = 6)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    // Total days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Total days in previous month
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = [];

    // 1. Fill previous month's padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, daysInPrevMonth - i);
      grid.push({
        date: prevDate,
        dayNum: prevDate.getDate(),
        isCurrentMonth: false,
        isToday: isSameDay(prevDate, new Date())
      });
    }

    // 2. Fill current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      const curDate = new Date(year, month, i);
      grid.push({
        date: curDate,
        dayNum: i,
        isCurrentMonth: true,
        isToday: isSameDay(curDate, new Date())
      });
    }

    // 3. Fill next month's padding days to complete grid (multiples of 7, usually 35 or 42 cells)
    const remainingCells = 42 - grid.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(year, month + 1, i);
      grid.push({
        date: nextDate,
        dayNum: i,
        isCurrentMonth: false,
        isToday: isSameDay(nextDate, new Date())
      });
    }

    return grid;
  };

  // Helper to compare dates ignoring hours
  const isSameDay = (d1, d2) => {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  };

  const gridDays = generateGridDays();
  const selectedDayShifts = getShiftsForDate(mobileSelectedDate);

  return (
    <div className="container" style={{ padding: '10px 0' }}>
      <div className="glass-panel" style={{ paddingBottom: '30px' }}>
        {/* Navigation & Filters header */}
        <div className="calendar-header-bar" style={{ marginBottom: '24px' }}>
          <div className="calendar-navigation">
            <button className="btn btn-secondary btn-icon-only" onClick={prevMonth}>
              <ChevronLeft size={20} />
            </button>
            <h3 className="calendar-month-title">{getCzechMonthName(currentDate)}</h3>
            <button className="btn btn-secondary btn-icon-only" onClick={nextMonth}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="calendar-filters">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Filtrovat:</span>
            </div>

            {/* Car Filter */}
            <select
              className="filter-select"
              value={selectedCarFilter}
              onChange={(e) => setSelectedCarFilter(e.target.value)}
            >
              <option value="all">Všechna auta</option>
              {cars.map(c => (
                <option key={c.id} value={c.id.toString()}>{c.model} ({c.spz})</option>
              ))}
            </select>

            {/* User Filter */}
            <select
              className="filter-select"
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
            >
              <option value="all">Všichni řidiči</option>
              {users.map(u => (
                <option key={u.id} value={u.id.toString()}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Načítám rozpis směn...</p>
        ) : (
          <>
            {/* DESKTOP CALENDAR VIEW (MONTH GRID) */}
            <div className="desktop-only">
              <div className="calendar-grid">
                {/* Weekday Names */}
                {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
                  <div key={day} className="calendar-day-name">{day}</div>
                ))}

                {/* Day Cells */}
                {gridDays.map((cell, idx) => {
                  const cellShifts = getShiftsForDate(cell.date);
                  
                  return (
                    <div
                      key={idx}
                      className={`calendar-day-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${cell.isToday ? 'today' : ''}`}
                    >
                      <span className="day-number">{cell.dayNum}</span>
                      <div className="day-cell-shifts">
                        {cellShifts.map(shift => (
                          <div
                            key={shift.id}
                            className={`day-shift-pill 
                              ${shift.status === 'approved' ? 'day-shift-approved' : ''}
                              ${shift.status === 'pending_create' ? 'day-shift-pending' : ''}
                              ${shift.status === 'pending_cancel' ? 'day-shift-pending-cancel' : ''}
                            `}
                            title={`${shift.userName} - ${shift.car?.model || ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedShiftDetails(shift);
                            }}
                          >
                            <strong>{formatTime(shift.dateFrom)}</strong> {shift.userName}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MOBILE CALENDAR VIEW (MONTH GRID + SHIFT LIST) */}
            <div className="mobile-only">
              {/* Weekday names above the grid */}
              <div className="mobile-calendar-grid-header">
                {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
                  <div key={day} className="mobile-calendar-day-name">{day}</div>
                ))}
              </div>

              {/* Monthly calendar grid switcher */}
              <div className="mobile-calendar-grid">
                {gridDays.map((cell, idx) => {
                  const hasShifts = getShiftsForDate(cell.date).length > 0;
                  const isSelected = isSameDay(cell.date, mobileSelectedDate);
                  return (
                    <button
                      key={idx}
                      className={`mobile-grid-day-btn 
                        ${isSelected ? 'selected' : ''} 
                        ${cell.isToday ? 'today' : ''} 
                        ${!cell.isCurrentMonth ? 'other-month' : ''}
                      `}
                      onClick={() => {
                        setMobileSelectedDate(cell.date);
                        if (!cell.isCurrentMonth) {
                          setCurrentDate(cell.date);
                        }
                      }}
                    >
                      <span className="mobile-day-num">{cell.dayNum}</span>
                      {hasShifts && <span className="mobile-day-indicator"></span>}
                    </button>
                  );
                })}
              </div>

              {/* Header showing selected date */}
              <h4 className="mobile-shifts-day-title">
                Směny dne: {mobileSelectedDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' })}
              </h4>

              {/* Shifts for the day */}
              <div className="mobile-shifts-container">
                {selectedDayShifts.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem'
                  }}>
                    Žádné směny na tento den.
                  </div>
                ) : (
                  selectedDayShifts.map(shift => (
                    <div
                      key={shift.id}
                      className="shift-card"
                      style={{ cursor: 'pointer', background: 'rgba(15, 23, 42, 0.6)' }}
                      onClick={() => setSelectedShiftDetails(shift)}
                    >
                      <div className="shift-card-header">
                        <span className="shift-card-car" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Car size={16} style={{ color: 'var(--primary)' }} />
                          {shift.car ? shift.car.model : 'Smazané auto'}
                        </span>
                        {getStatusBadge(shift.status, shift.dateTo)}
                      </div>

                      <div className="shift-card-time">
                        <Clock size={14} />
                        <span>{formatTime(shift.dateFrom)} - {formatTime(shift.dateTo)}</span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <User size={14} style={{ color: 'var(--primary)' }} />
                        <span>Řidič: <strong>{shift.userName}</strong></span>
                      </div>

                      {shift.notes && (
                        <div className="shift-card-notes" style={{ margin: '8px 0 0 0', padding: '8px', fontSize: '0.8rem' }}>
                          {shift.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* SHIFT DETAILS DIALOG / MODAL (FOR DETAILED VIEW ON CLICK) */}
      {selectedShiftDetails && (
        <div className="modal-overlay" onClick={() => setSelectedShiftDetails(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedShiftDetails(null)}>
              <X size={20} />
            </button>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info style={{ color: 'var(--primary)' }} /> Detail směny
              </h3>
            </div>
            
            <div className="modal-body">
              {editError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--danger)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  marginBottom: '10px'
                }}>
                  {editError}
                </div>
              )}

              <div className="modal-detail-row">
                <span className="modal-detail-label">Stav směny</span>
                <span className="modal-detail-value">
                  {getStatusBadge(selectedShiftDetails.status, selectedShiftDetails.dateTo)}
                </span>
              </div>

              <div className="modal-detail-row">
                <span className="modal-detail-label">Řidič</span>
                <span className="modal-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} style={{ color: 'var(--text-muted)' }} />
                  {selectedShiftDetails.userName}
                </span>
              </div>

              <div className="modal-detail-row">
                <span className="modal-detail-label">Vozidlo</span>
                <span className="modal-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Car size={16} style={{ color: 'var(--text-muted)' }} />
                  {selectedShiftDetails.car 
                    ? `${selectedShiftDetails.car.model} (${selectedShiftDetails.car.spz})` 
                    : 'Smazané auto'}
                </span>
              </div>

              {selectedShiftDetails.car && (
                <div className="modal-detail-row" style={{ marginTop: '-8px' }}>
                  <span className="modal-detail-label">Registrovaný majitel vozu</span>
                  <span className="modal-detail-value" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {selectedShiftDetails.car.ownerName}
                  </span>
                </div>
              )}

              <div className="modal-detail-row">
                <span className="modal-detail-label">Časový rozsah</span>
                {isEditingTime ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.7rem' }}>Datum</label>
                      <input
                        type="date"
                        className="form-control"
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.7rem' }}>Od (24h)</label>
                        <input
                          type="time"
                          step="60"
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                          value={editTimeFrom}
                          onChange={(e) => setEditTimeFrom(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.7rem' }}>Do (24h)</label>
                        <input
                          type="time"
                          step="60"
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                          value={editTimeTo}
                          onChange={(e) => setEditTimeTo(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="modal-detail-value">
                    Od: {formatDateTime(selectedShiftDetails.dateFrom)}<br />
                    Do: {formatDateTime(selectedShiftDetails.dateTo)}
                  </span>
                )}
              </div>

              <div className="modal-detail-row">
                <span className="modal-detail-label">Poznámka řidiče</span>
                {selectedShiftDetails.notes ? (
                  <div className="modal-notes-box">{selectedShiftDetails.notes}</div>
                ) : (
                  <span className="modal-detail-value" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Bez poznámky.</span>
                )}
              </div>

              {isEditingTime ? (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button className="btn btn-success" onClick={saveEditedTime}>
                    Uložit čas
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsEditingTime(false)}>
                    Zrušit
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  {currentUser.role === 'manager' && (
                    <button className="btn btn-secondary" onClick={startEditingTime} style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                      Upravit čas
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={() => setSelectedShiftDetails(null)} style={{ marginLeft: 'auto' }}>
                    Zavřít
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
