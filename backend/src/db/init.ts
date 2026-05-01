import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'echosign.db');

const db = new sqlite3.Database(dbPath);

const initDb = () => {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        language TEXT DEFAULT 'en',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Complaints table
    db.run(`
      CREATE TABLE IF NOT EXISTS complaints (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        description TEXT NOT NULL,
        video_path TEXT,
        confidence_score REAL,
        status TEXT DEFAULT 'submitted',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Status updates table (timeline)
    db.run(`
      CREATE TABLE IF NOT EXISTS status_updates (
        id TEXT PRIMARY KEY,
        complaint_id TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        signed_video_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id)
      )
    `);

    console.log('✓ Database initialized at:', dbPath);
    db.close();
  });
};

initDb();
