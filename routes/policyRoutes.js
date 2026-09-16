import express from 'express';
import Policy from '../models/Policy.js';

const router = express.Router();

// GET a policy by title
router.get('/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    const policy = await Policy.findOne({ title });
    if (!policy) {
      return res.status(404).json({ message: 'Policy not found' });
    }
    res.json(policy);
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT (upsert) a policy
router.put('/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    const { content, category } = req.body;
    
    const policy = await Policy.findOneAndUpdate(
      { title },
      { content, category, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    
    res.json({ message: 'Policy updated successfully', policy });
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
