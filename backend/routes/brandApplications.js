const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');

const router = express.Router();

// POST /api/brand-applications (public; no auth – form submission from homepage)
router.post('/', (req, res) => {
  const {
    company_name,
    contact_email,
    contact_name,
    brand_type,
    platforms,
    budget,
    rpm,
    other_specifications
  } = req.body || {};

  if (!contact_email || !contact_email.trim()) {
    return res.status(400).json({ error: 'Contact email is required' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO brand_applications (
      id, company_name, contact_email, contact_name,
      brand_type, platforms, budget, rpm, other_specifications, notes, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'pending')
  `).run(
    id,
    (company_name || '').trim(),
    contact_email.trim(),
    (contact_name || '').trim(),
    brand_type || '',
    Array.isArray(platforms) ? platforms.join(',') : (platforms || ''),
    budget != null ? Number(budget) : null,
    rpm != null ? Number(rpm) : null,
    (other_specifications || '').trim()
  );

  const row = db.prepare('SELECT * FROM brand_applications WHERE id = ?').get(id);
  res.status(201).json({ success: true, id: row.id });
});

module.exports = router;
