import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { run, get, all } from '../db/connection.js';
import { CreateComplaintRequest, Complaint, User, StatusUpdate, ComplaintResponse } from '../types.js';

const router = Router();

// Create a new complaint
router.post('/', async (req: Request, res: Response) => {
  try {
    const { phone, name, language, issue_type, description, video_base64, confidence_score } =
      req.body as CreateComplaintRequest;

    if (!phone || !name || !issue_type || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let userId: string;

    // Get or create user
    const existingUser = await get<User>('SELECT * FROM users WHERE phone = ?', [phone]);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      userId = uuid();
      await run(
        'INSERT INTO users (id, name, phone, language) VALUES (?, ?, ?, ?)',
        [userId, name, phone, language || 'en']
      );
    }

    // Create complaint
    const complaintId = uuid();
    let videoPath = null;

    // Store video if provided (in production, upload to S3 or similar)
    if (video_base64) {
      videoPath = `/videos/${complaintId}.webm`;
      // TODO: Save base64 video to file system
    }

    await run(
      `INSERT INTO complaints
       (id, user_id, issue_type, description, video_path, confidence_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [complaintId, userId, issue_type, description, videoPath, confidence_score || null, 'submitted']
    );

    // Create initial status update
    const statusId = uuid();
    await run(
      'INSERT INTO status_updates (id, complaint_id, status, message) VALUES (?, ?, ?, ?)',
      [statusId, complaintId, 'submitted', 'Your complaint has been received']
    );

    res.status(201).json({
      id: complaintId,
      user_id: userId,
      issue_type,
      description,
      video_path: videoPath,
      confidence_score: confidence_score || null,
      status: 'submitted',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message: 'Complaint submitted successfully',
    });
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ error: 'Failed to create complaint' });
  }
});

// Get complaint by ID with user and updates
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const complaint = await get<Complaint>('SELECT * FROM complaints WHERE id = ?', [id]);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const user = await get<User>('SELECT * FROM users WHERE id = ?', [complaint.user_id]);
    const updates = await all<StatusUpdate>(
      'SELECT * FROM status_updates WHERE complaint_id = ? ORDER BY created_at ASC',
      [id]
    );

    res.json({
      ...complaint,
      user,
      updates,
    } as ComplaintResponse);
  } catch (error) {
    console.error('Error fetching complaint:', error);
    res.status(500).json({ error: 'Failed to fetch complaint' });
  }
});

// Get all complaints (admin)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, user_id, limit = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM complaints WHERE 1=1';
    const params: any[] = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const complaints = await all<Complaint>(sql, params);

    // Fetch users for each complaint
    const enriched = await Promise.all(
      complaints.map(async (complaint) => {
        const user = await get<User>('SELECT * FROM users WHERE id = ?', [complaint.user_id]);
        return { ...complaint, user };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Update complaint status
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, message, signed_video_base64 } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const complaint = await get<Complaint>('SELECT * FROM complaints WHERE id = ?', [id]);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Update complaint status
    await run('UPDATE complaints SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      status,
      id,
    ]);

    // Create status update entry
    const statusId = uuid();
    let signedVideoPath = null;

    if (signed_video_base64) {
      signedVideoPath = `/videos/${statusId}.webm`;
      // TODO: Save base64 video to file system
    }

    await run(
      'INSERT INTO status_updates (id, complaint_id, status, message, signed_video_path) VALUES (?, ?, ?, ?, ?)',
      [statusId, id, status, message || null, signedVideoPath]
    );

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(500).json({ error: 'Failed to update complaint' });
  }
});

export default router;
