const { runSchema, db } = require('./index');
runSchema();
console.log('Database schema applied.');
// Seed a demo campaign
const { v4: uuid } = require('uuid');
const campaign = db.prepare("SELECT id FROM campaigns LIMIT 1").get();
if (!campaign) {
  const id = uuid();
  db.prepare(`
    INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Demo Gaming Clips', 'Create short clips from gaming streams. High RPM.', 'gaming', 'tiktok', 5000, 5, 'active');
  console.log('Seeded demo campaign:', id);
}
process.exit(0);
