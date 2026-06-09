import express from 'express';
import { getDb } from '../database/db.js';
import { authenticatePortal } from '../middlewares/authMiddleware.js';
import { runSecureBackup, runSecureRestore, listAvailableBackups } from '../services/backupService.js';

const router = express.Router();

// ==========================================
// ADMIN PORTAL ENDPOINTS
// ==========================================

// Get all users (Admin only)
router.get('/admin/users', authenticatePortal('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const users = await db.all('SELECT id, email, name, role, google_id, apple_id, created_at FROM users ORDER BY id DESC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a user (Admin only)
router.delete('/admin/users/:id', authenticatePortal('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM users WHERE id = ?', id);
    res.json({ success: true, message: 'Utilisateur supprimé avec succès.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List backups (Admin only)
router.get('/admin/backups', authenticatePortal('admin'), async (req, res) => {
  try {
    const backups = await listAvailableBackups();
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a backup (Admin only)
router.post('/admin/backups/run', authenticatePortal('admin'), async (req, res) => {
  try {
    const result = await runSecureBackup();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore a backup (Admin only)
router.post('/admin/backups/restore', authenticatePortal('admin'), async (req, res) => {
  const { backupName } = req.body;
  if (!backupName) {
    return res.status(400).json({ error: 'Nom de la sauvegarde requis.' });
  }
  try {
    const result = await runSecureRestore(backupName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// TEAM PORTAL ENDPOINTS
// ==========================================

// Get statistics for the team dashboard (Team only)
router.get('/team/leads-stats', authenticatePortal('team'), async (req, res) => {
  try {
    const db = await getDb();
    
    const totalLeads = await db.get('SELECT COUNT(*) as count FROM leads');
    const contactedLeads = await db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'Contacted'");
    const wonLeads = await db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'Closed Won'");
    const emailLeads = await db.get("SELECT COUNT(*) as count FROM leads WHERE email IS NOT NULL AND email != ''");
    const phoneLeads = await db.get("SELECT COUNT(*) as count FROM leads WHERE phone IS NOT NULL AND phone != ''");

    res.json({
      totalLeads: totalLeads.count,
      contactedLeads: contactedLeads.count,
      wonLeads: wonLeads.count,
      emailCoverageRate: totalLeads.count > 0 ? Math.round((emailLeads.count / totalLeads.count) * 100) : 0,
      phoneCoverageRate: totalLeads.count > 0 ? Math.round((phoneLeads.count / totalLeads.count) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
