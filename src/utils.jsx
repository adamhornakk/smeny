import React from 'react';

export function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return isoString;

  const weekdays = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const dayName = weekdays[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${dayName} ${day}. ${month}. ${year}, ${hours}:${minutes}`;
}

export function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return isoString;

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

export function getStatusBadge(status, dateTo) {
  if (status === 'approved' && dateTo && new Date(dateTo) < new Date()) {
    return <span className="badge" style={{ background: 'rgba(71, 85, 105, 0.15)', color: 'var(--text-muted)', borderColor: 'rgba(71, 85, 105, 0.3)' }}>Dokončeno</span>;
  }
  switch (status) {
    case 'pending_create':
      return <span className="badge badge-pending">Čeká na schválení</span>;
    case 'approved':
      return <span className="badge badge-approved">Schváleno</span>;
    case 'pending_cancel':
      return <span className="badge badge-cancel-pending">Čeká na zrušení</span>;
    case 'cancelled':
      return <span className="badge badge-cancelled">Zrušeno</span>;
    default:
      return <span className="badge">{status}</span>;
  }
}
