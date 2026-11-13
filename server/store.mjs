// MongoDB access for ZAIKORA. Collections:
//   players       accounts (username, password hash, timestamps)
//   authTokens    login tokens (hashed), removed automatically when they expire
//   saves         one per player: progress, checkpoints, inventory, skills, upgrades, habits
//   matches       full history of every match played (habits/analytics)
//   playSessions  each visit: start, end, duration
import { MongoClient } from 'mongodb';

export class Store {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.players = db.collection('players');
    this.authTokens = db.collection('authTokens');
    this.saves = db.collection('saves');
    this.matches = db.collection('matches');
    this.playSessions = db.collection('playSessions');
  }

  static async connect(uri, dbName) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'zaikora' });
    await client.connect();
    const store = new Store(client, client.db(dbName));
    await store.init();
    return store;
  }

  async init() {
    await Promise.all([
      this.players.createIndex({ usernameLower: 1 }, { unique: true }),
      this.authTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.authTokens.createIndex({ playerId: 1 }),
      this.matches.createIndex({ playerId: 1, at: -1 }),
      this.playSessions.createIndex({ playerId: 1, startedAt: -1 }),
    ]);
  }

  close() {
    return this.client.close();
  }
}
