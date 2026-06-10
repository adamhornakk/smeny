import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readDb, writeDb as originalWriteDb } from './db.js';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BOoI5_ZFtrBiaUzrjNOduMO3a047g67FqVTJt6tGjqan_uo3FNgBesWJklV3NVHKWx7kMm_Di7wefw3o-ujxTVI';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'sqOq_MVLcUk2tEqwBLlrHsFJX6_2mmcFxCbRg9nJ7is';

webpush.setVapidDetails(
  'mailto:smeny@smeny.local',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5050;

// Setup JWT secret key: fallback to generated secure random if not specified
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET environment variable is not defined. Using an auto-generated random secret. Existing user sessions will be invalidated on server restart.');
}

app.use(express.json());

// SSE active connection registry
let activeClients = [];

const notifyClients = async (payload = null) => {
  // 1. SSE live update notification
  activeClients.forEach(client => {
    try {
      let shouldSend = true;
      if (payload && payload.targetUserId && client.userId) {
        shouldSend = client.userId === payload.targetUserId;
      } else if (payload && payload.targetRole && client.role) {
        shouldSend = client.role === payload.targetRole;
      }
      
      if (shouldSend) {
        client.res.write(`data: ${JSON.stringify({ 
          type: 'update', 
          notification: payload 
        })}\n\n`);
      } else {
        client.res.write('data: {"type":"update"}\n\n');
      }
    } catch (err) {
      // Connection closed
    }
  });

  // 2. Web Push background notifications
  if (payload) {
    try {
      const db = readDb();
      let targetUsers = [];

      if (payload.targetUserId) {
        const user = db.users.find(u => u.id === payload.targetUserId);
        if (user) targetUsers.push(user);
      } else if (payload.targetRole) {
        targetUsers = db.users.filter(u => u.role === payload.targetRole);
      }

      let subscriptionsUpdated = false;

      for (const targetUser of targetUsers) {
        if (targetUser.pushSubscriptions && targetUser.pushSubscriptions.length > 0) {
          const validSubscriptions = [];
          for (const sub of targetUser.pushSubscriptions) {
            try {
              await webpush.sendNotification(sub, JSON.stringify({
                title: payload.title,
                body: payload.body
              }));
              validSubscriptions.push(sub);
            } catch (err) {
              if (err.statusCode === 404 || err.statusCode === 410) {
                // Subscription has expired or is no longer valid, delete it
                subscriptionsUpdated = true;
              } else {
                console.error(`Chyba při odesílání push notifikace pro uživatele ${targetUser.id}:`, err);
                validSubscriptions.push(sub);
              }
            }
          }
          if (subscriptionsUpdated) {
            targetUser.pushSubscriptions = validSubscriptions;
          }
        }
      }

      if (subscriptionsUpdated) {
        originalWriteDb(db);
      }
    } catch (pushErr) {
      console.error('Chyba při zpracování push notifikací na pozadí:', pushErr);
    }
  }
};

const writeDb = (db, notification = null) => {
  const success = originalWriteDb(db);
  if (success) {
    notifyClients(notification);
  }
  return success;
};

// CORS headers for development if running on different ports (though Vite proxy is preferred)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Simple authentication middleware using JWT token
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Uživatel není přihlášen.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const user = db.users.find(u => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Neplatná relace uživatele.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Neplatný nebo expirovaný přihlašovací token.' });
  }
};

// Manager authorization check
const requireManager = (req, res, next) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Tato akce vyžaduje oprávnění manažera.' });
  }
  next();
};

// --- REAL-TIME LIVE UPDATE API ---
app.get('/api/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write('data: {"type":"init"}\n\n');

  // Authenticate SSE client via query parameter
  const token = req.query.token;
  let clientUser = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const db = readDb();
      clientUser = db.users.find(u => u.id === decoded.userId);
    } catch (err) {
      // Ignore invalid tokens
    }
  }

  const clientObj = {
    res,
    userId: clientUser ? clientUser.id : null,
    role: clientUser ? clientUser.role : null
  };

  activeClients.push(clientObj);

  req.on('close', () => {
    activeClients = activeClients.filter(c => c !== clientObj);
  });
});

// --- AUTH API ---

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Zadejte uživatelské jméno a heslo.' });
  }

  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Nesprávné uživatelské jméno nebo heslo.' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  return res.status(403).json({ error: 'Samoobslužná registrace je zakázána. Nové uživatele může vytvořit pouze manažer.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  });
});

app.put('/api/auth/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Vyplňte stávající a nové heslo.' });
  }

  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }

  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: 'Stávající heslo je nesprávné.' });
  }

  user.password = bcrypt.hashSync(newPassword, 10);
  writeDb(db);

  res.json({ message: 'Heslo bylo úspěšně změněno.' });
});

// --- CARS API ---

// Helper function to resolve car owner details
const getCarsWithOwners = (db) => {
  return db.cars.map(car => {
    const owner = db.users.find(u => u.id === car.ownerId);
    return {
      ...car,
      ownerName: owner ? owner.name : 'Neznámý vlastník'
    };
  });
};

app.get('/api/cars', authenticate, (req, res) => {
  const db = readDb();
  res.json(getCarsWithOwners(db));
});

// Endpoint to check availability for all cars for a given time window
app.get('/api/cars/availability', authenticate, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Chybí parametry od a do.' });
  }

  const db = readDb();
  const fromTime = new Date(from);
  const toTime = new Date(to);

  if (isNaN(fromTime) || isNaN(toTime) || fromTime >= toTime) {
    return res.status(400).json({ error: 'Neplatný časový rozsah.' });
  }

  // Get active (not cancelled) shifts
  const activeShifts = db.shifts.filter(s => s.status !== 'cancelled');

  const cars = getCarsWithOwners(db);

  const availability = cars.map(car => {
    // Find if there is any overlapping shift for this car
    const overlappingShift = activeShifts.find(s => {
      if (s.carId !== car.id) return false;
      const sFrom = new Date(s.dateFrom);
      const sTo = new Date(s.dateTo);
      // Overlap: S1 < E2 and S2 < E1
      return sFrom < toTime && fromTime < sTo;
    });

    if (overlappingShift) {
      const user = db.users.find(u => u.id === overlappingShift.userId);
      return {
        ...car,
        isAvailable: false,
        occupiedBy: user ? user.name : 'Neznámý uživatel',
        occupiedUntil: overlappingShift.dateTo
      };
    }

    return {
      ...car,
      isAvailable: true,
      occupiedBy: null,
      occupiedUntil: null
    };
  });

  res.json(availability);
});

app.post('/api/cars', authenticate, requireManager, (req, res) => {
  const { model, spz, ownerId } = req.body;
  if (!model || !spz || !ownerId) {
    return res.status(400).json({ error: 'Vyplňte model, SPZ a majitele vozu.' });
  }

  const db = readDb();
  const owner = db.users.find(u => u.id === parseInt(ownerId, 10));
  if (!owner) {
    return res.status(400).json({ error: 'Vybraný majitel vozu neexistuje.' });
  }

  const newCar = {
    id: db.cars.length > 0 ? Math.max(...db.cars.map(c => c.id)) + 1 : 1,
    model,
    spz,
    ownerId: parseInt(ownerId, 10)
  };

  db.cars.push(newCar);
  writeDb(db);

  res.status(201).json({
    ...newCar,
    ownerName: owner.name
  });
});

app.delete('/api/cars/:id', authenticate, requireManager, (req, res) => {
  const carId = parseInt(req.params.id, 10);
  const db = readDb();
  const carIndex = db.cars.findIndex(c => c.id === carId);

  if (carIndex === -1) {
    return res.status(404).json({ error: 'Auto nebylo nalezeno.' });
  }

  // Delete car and mark its shifts as cancelled or delete them?
  // Let's cancel future shifts for this car to keep historical references or delete them.
  // We will cancel them to maintain db consistency.
  db.cars.splice(carIndex, 1);
  db.shifts = db.shifts.map(s => s.carId === carId ? { ...s, status: 'cancelled' } : s);
  writeDb(db);

  res.json({ message: 'Auto bylo úspěšně smazáno.' });
});

// --- USERS API ---

app.get('/api/users', authenticate, (req, res) => {
  const db = readDb();
  // Don't send passwords back
  const safeUsers = db.users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role
  }));
  res.json(safeUsers);
});

app.post('/api/users', authenticate, requireManager, (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Vyplňte všechna pole.' });
  }

  const db = readDb();
  const existing = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Uživatelské jméno je již obsazené.' });
  }

  // Hash password using bcryptjs
  const hashedPassword = bcrypt.hashSync(password, 10);

  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username,
    name,
    password: hashedPassword,
    role
  };

  db.users.push(newUser);
  writeDb(db);

  res.status(201).json({
    id: newUser.id,
    username: newUser.username,
    name: newUser.name,
    role: newUser.role
  });
});

app.delete('/api/users/:id', authenticate, requireManager, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Nemůžete smazat sám sebe.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }

  db.users.splice(userIndex, 1);
  // Cancel related shifts for this deleted user
  db.shifts = db.shifts.map(s => s.userId === userId ? { ...s, status: 'cancelled' } : s);
  // Re-assign or remove owner from cars where this user was the owner (default to manager id 1)
  db.cars = db.cars.map(c => c.ownerId === userId ? { ...c, ownerId: 1 } : c);

  writeDb(db);

  res.json({ message: 'Uživatel byl úspěšně smazán.' });
});

// --- SHIFTS API ---

app.get('/api/shifts', authenticate, (req, res) => {
  const db = readDb();
  
  const populatedShifts = db.shifts.map(shift => {
    const user = db.users.find(u => u.id === shift.userId);
    const car = db.cars.find(c => c.id === shift.carId);
    
    let carWithOwner = null;
    if (car) {
      const owner = db.users.find(u => u.id === car.ownerId);
      carWithOwner = {
        ...car,
        ownerName: owner ? owner.name : 'Neznámý vlastník'
      };
    }

    return {
      ...shift,
      userName: user ? user.name : 'Smazaný uživatel',
      car: carWithOwner
    };
  });

  res.json(populatedShifts);
});

app.post('/api/shifts', authenticate, (req, res) => {
  const { carId, dateFrom, dateTo, notes } = req.body;
  if (!carId || !dateFrom || !dateTo) {
    return res.status(400).json({ error: 'Vyplňte auto a časové rozmezí.' });
  }

  const db = readDb();
  const parsedCarId = parseInt(carId, 10);
  const fromTime = new Date(dateFrom);
  const toTime = new Date(dateTo);

  if (isNaN(fromTime) || isNaN(toTime) || fromTime >= toTime) {
    return res.status(400).json({ error: 'Neplatný časový rozsah směny.' });
  }

  // Check if car exists
  const car = db.cars.find(c => c.id === parsedCarId);
  if (!car) {
    return res.status(404).json({ error: 'Vybrané auto neexistuje.' });
  }

  // Check overlap with active shifts
  const activeShifts = db.shifts.filter(s => s.status !== 'cancelled');
  const overlap = activeShifts.find(s => {
    if (s.carId !== parsedCarId) return false;
    const sFrom = new Date(s.dateFrom);
    const sTo = new Date(s.dateTo);
    return sFrom < toTime && fromTime < sTo;
  });

  if (overlap) {
    const user = db.users.find(u => u.id === overlap.userId);
    return res.status(400).json({ 
      error: `Auto v tento čas již není dostupné. Má ho zarezervované ${user ? user.name : 'jiný uživatel'}.` 
    });
  }

  const newShift = {
    id: db.shifts.length > 0 ? Math.max(...db.shifts.map(s => s.id)) + 1 : 1,
    userId: req.user.id,
    carId: parsedCarId,
    dateFrom,
    dateTo,
    status: 'pending_create', // Every request needs manager approval
    notes: notes || ''
  };

  db.shifts.push(newShift);

  const formattedDate = new Date(dateFrom).toLocaleDateString('cs-CZ');
  const notificationPayload = {
    title: 'Nová žádost o směnu',
    body: `${req.user.name} žádá o vůz ${car.model} dne ${formattedDate}.`,
    targetRole: 'manager'
  };

  writeDb(db, notificationPayload);

  // Return populated shift
  res.status(201).json({
    ...newShift,
    userName: req.user.name,
    car: {
      ...car,
      ownerName: db.users.find(u => u.id === car.ownerId)?.name || 'Neznámý vlastník'
    }
  });
});

app.put('/api/shifts/:id', authenticate, (req, res) => {
  const shiftId = parseInt(req.params.id, 10);
  const { status, notes, dateFrom, dateTo } = req.body;
  const db = readDb();

  const shift = db.shifts.find(s => s.id === shiftId);
  if (!shift) {
    return res.status(404).json({ error: 'Směna nebyla nalezena.' });
  }

  // Capture original status and times
  const originalStatus = shift.status;
  const originalDateFrom = shift.dateFrom;
  const originalDateTo = shift.dateTo;

  // Edit notes is allowed for the shift owner or manager
  if (notes !== undefined) {
    if (shift.userId !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Nemáte oprávnění upravovat poznámky této směny.' });
    }
    shift.notes = notes;
  }

  // Edit dateFrom / dateTo is allowed only for manager
  if (dateFrom !== undefined || dateTo !== undefined) {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Pouze manažer může upravovat časy směn.' });
    }

    const newDateFrom = dateFrom !== undefined ? dateFrom : shift.dateFrom;
    const newDateTo = dateTo !== undefined ? dateTo : shift.dateTo;
    
    const fromTime = new Date(newDateFrom);
    const toTime = new Date(newDateTo);

    if (isNaN(fromTime) || isNaN(toTime) || fromTime >= toTime) {
      return res.status(400).json({ error: 'Neplatný časový rozsah směny.' });
    }

    // Check collision with other active shifts (excluding this one)
    const activeShifts = db.shifts.filter(s => s.status === 'approved' && s.id !== shiftId && s.carId === shift.carId);
    const collision = activeShifts.find(s => {
      return new Date(s.dateFrom) < toTime && fromTime < new Date(s.dateTo);
    });

    if (collision) {
      const user = db.users.find(u => u.id === collision.userId);
      return res.status(400).json({ 
        error: `Auto v tento čas již není dostupné. Má ho zarezervované ${user ? user.name : 'jiný uživatel'}.` 
      });
    }

    shift.dateFrom = newDateFrom;
    shift.dateTo = newDateTo;
  }

  // Handle status updates
  if (status !== undefined) {
    // Standard User requesting cancellation
    if (status === 'pending_cancel') {
      if (shift.userId !== req.user.id) {
        return res.status(403).json({ error: 'Můžete zrušit pouze své vlastní směny.' });
      }
      if (shift.status !== 'approved') {
        return res.status(400).json({ error: 'Lze zrušit pouze schválené směny.' });
      }
      // Block cancellation of finished shifts
      if (new Date(shift.dateTo) < new Date()) {
        return res.status(400).json({ error: 'Nelze zrušit již dokončenou směnu.' });
      }
      shift.status = 'pending_cancel';
    } 
    // Manager approval workflows
    else if (['approved', 'cancelled'].includes(status)) {
      if (req.user.role !== 'manager') {
        return res.status(403).json({ error: 'Pouze manažer může schvalovat nebo rušit směny.' });
      }

      // If manager approves shift creation: pending_create -> approved
      if (shift.status === 'pending_create' && status === 'approved') {
        // Double check collision just in case (to prevent race conditions)
        const activeShifts = db.shifts.filter(s => s.status === 'approved' && s.id !== shiftId);
        const fromTime = new Date(shift.dateFrom);
        const toTime = new Date(shift.dateTo);
        const collision = activeShifts.find(s => {
          if (s.carId !== shift.carId) return false;
          return new Date(s.dateFrom) < toTime && fromTime < new Date(s.dateTo);
        });

        if (collision) {
          return res.status(400).json({ error: 'Nelze schválit: Auto je již v tento čas obsazené schválenou směnou.' });
        }
        shift.status = 'approved';
      }
      // If manager rejects shift creation: pending_create -> cancelled
      else if (shift.status === 'pending_create' && status === 'cancelled') {
        shift.status = 'cancelled';
      }
      // If manager approves cancellation: pending_cancel -> cancelled
      else if (shift.status === 'pending_cancel' && status === 'cancelled') {
        shift.status = 'cancelled';
      }
      // If manager rejects cancellation: pending_cancel -> approved
      else if (shift.status === 'pending_cancel' && status === 'approved') {
        shift.status = 'approved';
      }
      else {
        shift.status = status;
      }
    } else {
      return res.status(400).json({ error: 'Neplatná změna stavu.' });
    }
  }

  // Build notification payload
  let notificationPayload = null;
  const car = db.cars.find(c => c.id === shift.carId);
  const carModel = car ? car.model : 'vozidlo';
  const formattedDate = new Date(shift.dateFrom).toLocaleDateString('cs-CZ');

  if (status !== undefined) {
    if (status === 'pending_cancel') {
      notificationPayload = {
        title: 'Žádost o zrušení směny',
        body: `${req.user.name} žádá o zrušení směny s vozem ${carModel} dne ${formattedDate}.`,
        targetRole: 'manager'
      };
    } else if (req.user.role === 'manager') {
      if (originalStatus === 'pending_create' && shift.status === 'approved') {
        notificationPayload = {
          title: 'Směna schválena',
          body: `Vaše směna s vozem ${carModel} dne ${formattedDate} byla schválena.`,
          targetUserId: shift.userId
        };
      } else if (originalStatus === 'pending_create' && shift.status === 'cancelled') {
        notificationPayload = {
          title: 'Směna zamítnuta',
          body: `Vaše žádost o směnu s vozem ${carModel} dne ${formattedDate} byla zamítnuta.`,
          targetUserId: shift.userId
        };
      } else if (originalStatus === 'pending_cancel' && shift.status === 'cancelled') {
        notificationPayload = {
          title: 'Zrušení směny schváleno',
          body: `Vaše směna s vozem ${carModel} dne ${formattedDate} byla úspěšně zrušena.`,
          targetUserId: shift.userId
        };
      } else if (originalStatus === 'pending_cancel' && shift.status === 'approved') {
        notificationPayload = {
          title: 'Zrušení směny zamítnuto',
          body: `Vaše žádost o zrušení směny s vozem ${carModel} dne ${formattedDate} byla zamítnuta. Směna zůstává platná.`,
          targetUserId: shift.userId
        };
      }
    }
  } else if ((dateFrom !== undefined || dateTo !== undefined) && req.user.role === 'manager') {
    notificationPayload = {
      title: 'Změna času směny',
      body: `Manažer upravil čas vaší směny s vozem ${carModel} dne ${formattedDate}.`,
      targetUserId: shift.userId
    };
  }

  writeDb(db, notificationPayload);

  // Return populated shift
  const user = db.users.find(u => u.id === shift.userId);
  res.json({
    ...shift,
    userName: user ? user.name : 'Smazaný uživatel',
    car: car ? {
      ...car,
      ownerName: db.users.find(u => u.id === car.ownerId)?.name || 'Neznámý vlastník'
    } : null
  });
});

// --- PUSH NOTIFICATIONS API ---

app.get('/api/notifications/vapid-key', authenticate, (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/notifications/subscribe', authenticate, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Chybí parametry registrace k odběru.' });
  }

  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }

  if (!user.pushSubscriptions) {
    user.pushSubscriptions = [];
  }

  // Check if subscription already exists to avoid duplicates
  const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    user.pushSubscriptions.push(subscription);
    originalWriteDb(db);
  }

  res.status(201).json({ message: 'Registrace k odběru byla úspěšná.' });
});

// --- CALENDAR INTEGRATION API ---

// Helper function to format date to iCalendar UTC format (YYYYMMDDTHHMMSSZ)
function formatIcsDate(dateString) {
  const date = new Date(dateString);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

// Get user's calendar token
app.get('/api/calendar/token', authenticate, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }
  res.json({ token: user.calendarToken || null });
});

// Generate/regenerate user's calendar token
app.post('/api/calendar/token', authenticate, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }

  // Generate 24-byte secure hex token (48 chars)
  const newToken = crypto.randomBytes(24).toString('hex');
  user.calendarToken = newToken;
  originalWriteDb(db);

  res.json({ token: newToken });
});

// Revoke user's calendar token
app.delete('/api/calendar/token', authenticate, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Uživatel nebyl nalezen.' });
  }

  delete user.calendarToken;
  originalWriteDb(db);

  res.json({ message: 'Kalendářové předplatné bylo úspěšně zrušeno.' });
});

// Public endpoint to serve the iCalendar feed
app.get('/api/calendar/:token.ics', (req, res) => {
  const { token } = req.params;
  const db = readDb();

  const user = db.users.find(u => u.calendarToken === token);
  if (!user) {
    return res.status(404).send('Platný kalendář pro tento odkaz nebyl nalezen.');
  }

  // Find all active shifts for this user
  const myShifts = db.shifts.filter(s => s.userId === user.id && s.status !== 'cancelled');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smeny//Scheduler//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Směny - ${user.name}`,
    'X-WR-TIMEZONE:UTC'
  ];

  myShifts.forEach(shift => {
    const car = db.cars.find(c => c.id === shift.carId);
    const carInfo = car ? `${car.model} (${car.spz})` : 'Neznámé vozidlo';
    
    let statusText = 'Schváleno';
    if (shift.status === 'pending_create') {
      statusText = 'Čeká na schválení vytvoření';
    } else if (shift.status === 'pending_cancel') {
      statusText = 'Čeká na schválení zrušení';
    }

    const summary = `Směna: ${carInfo}`;
    const description = `Poznámka: ${shift.notes || 'Bez poznámky'}\\nStav: ${statusText}`;
    
    const dtstart = formatIcsDate(shift.dateFrom);
    const dtend = formatIcsDate(shift.dateTo);
    const dtstamp = formatIcsDate(new Date());
    const uid = `shift-${shift.id}@smeny`;

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${uid}`);
    icsContent.push(`DTSTAMP:${dtstamp}`);
    icsContent.push(`DTSTART:${dtstart}`);
    icsContent.push(`DTEND:${dtend}`);
    icsContent.push(`SUMMARY:${summary}`);
    icsContent.push(`DESCRIPTION:${description}`);
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="smeny-${user.id}.ics"`);
  res.send(icsContent.join('\r\n'));
});


// --- SERVING FRONTEND IN PRODUCTION ---
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  // If the request doesn't match API, serve React App index.html
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
