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
      name: 'Manažer',
      password: '$2b$10$QvdX9FW3CpKwtlCEyzEgueVANDL.V3FUAONl/5uE8xLqOT3DRM6NG', // bcrypt hash of "admin"
      role: 'manager'
    }
  ],
  cars: [],
  shifts: []
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
