import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

const INITIAL_DATA = {
  users: [
    {
      id: 1,
      username: 'admin',
      name: 'Manažer Martin',
      password: 'admin', // In a production app, use bcrypt hashing
      role: 'manager'
    },
    {
      id: 2,
      username: 'john',
      name: 'Jan Novák',
      password: 'john',
      role: 'user'
    },
    {
      id: 3,
      username: 'jane',
      name: 'Jana Svobodová',
      password: 'jane',
      role: 'user'
    }
  ],
  cars: [
    {
      id: 1,
      model: 'Škoda Octavia IV',
      spz: '1AB 1234',
      ownerId: 2 // Jan Novák
    },
    {
      id: 2,
      model: 'Volkswagen Golf VIII',
      spz: '2BC 5678',
      ownerId: 3 // Jana Svobodová
    },
    {
      id: 3,
      model: 'Tesla Model 3',
      spz: '3CD 9012',
      ownerId: 1 // Manažer Martin
    }
  ],
  shifts: [
    {
      id: 1,
      userId: 2, // Jan Novák
      carId: 1,  // Škoda Octavia IV
      // Tomorrow 08:00 to 16:00 (Czech format ISO dates)
      dateFrom: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T08:00',
      dateTo: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T16:00',
      status: 'approved',
      notes: 'Pravidelná ranní rozvážka.'
    },
    {
      id: 2,
      userId: 3, // Jana Svobodová
      carId: 2,  // Volkswagen Golf VIII
      // Day after tomorrow 10:00 to 18:00
      dateFrom: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T10:00',
      dateTo: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T18:00',
      status: 'pending_create',
      notes: 'Schůzka s klientem v Brně.'
    }
  ]
};

export function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(INITIAL_DATA);
      return INITIAL_DATA;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database file, returning initial data', error);
    return INITIAL_DATA;
  }
}

export function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing to database file', error);
    return false;
  }
}

// Initialize database right away
readDb();
