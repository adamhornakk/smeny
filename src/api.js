const API_BASE = '/api';

// Helper to get auth header
function getHeaders() {
  const token = localStorage.getItem('smeny_token');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `Chyba serveru (${response.status})`;
    throw new Error(errorMessage);
  }
  return response.json();
}

export const api = {
  // Authentication
  async login(username, password) {
    const data = await handleResponse(
      await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
    );
    localStorage.setItem('smeny_token', data.token);
    return data;
  },

  async changePassword(oldPassword, newPassword) {
    return handleResponse(
      await fetch(`${API_BASE}/auth/change-password`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ oldPassword, newPassword }),
      })
    );
  },

  async getMe() {
    return handleResponse(
      await fetch(`${API_BASE}/auth/me`, {
        headers: getHeaders(),
      })
    );
  },

  logout() {
    localStorage.removeItem('smeny_token');
  },

  // Cars
  async getCars() {
    return handleResponse(
      await fetch(`${API_BASE}/cars`, {
        headers: getHeaders(),
      })
    );
  },

  async getCarsAvailability(from, to) {
    return handleResponse(
      await fetch(`${API_BASE}/cars/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        headers: getHeaders(),
      })
    );
  },

  async addCar(model, spz, ownerId) {
    return handleResponse(
      await fetch(`${API_BASE}/cars`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ model, spz, ownerId }),
      })
    );
  },

  async deleteCar(id) {
    return handleResponse(
      await fetch(`${API_BASE}/cars/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
    );
  },

  // Users
  async getUsers() {
    return handleResponse(
      await fetch(`${API_BASE}/users`, {
        headers: getHeaders(),
      })
    );
  },

  async addUser(username, password, name, role) {
    return handleResponse(
      await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ username, password, name, role }),
      })
    );
  },

  async deleteUser(id) {
    return handleResponse(
      await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
    );
  },

  // Shifts
  async getShifts() {
    return handleResponse(
      await fetch(`${API_BASE}/shifts`, {
        headers: getHeaders(),
      })
    );
  },

  async requestShift(carId, dateFrom, dateTo, notes) {
    return handleResponse(
      await fetch(`${API_BASE}/shifts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ carId, dateFrom, dateTo, notes }),
      })
    );
  },

  async updateShiftStatus(id, status) {
    return handleResponse(
      await fetch(`${API_BASE}/shifts/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
    );
  },

  async updateShiftNotes(id, notes) {
    return handleResponse(
      await fetch(`${API_BASE}/shifts/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ notes }),
      })
    );
  },

  async updateShiftTimes(id, dateFrom, dateTo) {
    return handleResponse(
      await fetch(`${API_BASE}/shifts/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ dateFrom, dateTo }),
      })
    );
  },
};
