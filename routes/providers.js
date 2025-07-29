import express from 'express';
import multer from 'multer';
import { storage } from '../utils/firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Provider from '../models/Provider.js';
import Service from '../models/Service.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Get all providers with optional search and location filters
router.get('/', async (req, res) => {
  try {
    const { query, location } = req.query;
    let filter = {};

    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { service: { $regex: query, $options: 'i' } },
      ];
    }

    const providers = await Provider.find(filter).populate('services').populate('reviews');
    console.log(`Fetched ${providers.length} providers for query:`, { query, location });
    res.json(providers);
  } catch (err) {
    console.error('Get providers error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get single provider by ID
router.get('/:providerId', async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.providerId).populate('services').populate('reviews');
    if (!provider) {
      console.log(`Provider not found for ID ${req.params.providerId}`);
      return res.status(404).json({ message: 'Provider not found' });
    }
    res.json(provider);
  } catch (err) {
    console.error('Get provider error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get provider by user ID
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId) {
      console.log(`Unauthorized access attempt by user ${req.user.id} for provider ${userId}`);
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const provider = await Provider.findOne({ user: userId }).populate('services').populate('reviews');
    if (!provider) {
      console.log(`Provider not found for user ${userId}`);
      return res.status(404).json({ message: 'Provider not found' });
    }

    res.json(provider);
  } catch (err) {
    console.error('Get provider error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get provider profile
router.get('/profile', auth, async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user.id }).populate('services').populate('reviews');
    if (!provider) {
      console.log(`Provider not found for user ${req.user.id}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }
    res.json(provider);
  } catch (err) {
    console.error('Get provider profile error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update provider profile
router.put('/profile', auth, async (req, res) => {
  try {
    let provider = await Provider.findOne({ user: req.user.id });
    if (!provider) {
      provider = new Provider({
        user: req.user.id,
        name: req.user.name,
        service: req.body.service,
        location: req.body.location,
        photo: null // Default to null for Firebase
      });
    } else {
      provider.service = req.body.service || provider.service;
      provider.location = req.body.location || provider.location;
    }
    await provider.save();
    console.log(`Provider profile updated for user ${req.user.id}`);
    res.json(provider);
  } catch (err) {
    console.error('Update provider profile error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Upload provider photo
router.post('/upload-photo', auth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Profile picture upload attempt for user ${userId}`);

    const provider = await Provider.findOne({ user: userId });
    if (!provider) {
      console.log(`Provider not found for user ${userId}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    if (!req.file) {
      console.log(`No file uploaded for user ${userId}`);
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Create a unique filename using userId and timestamp
    const fileName = `profile_pictures/${userId}/${Date.now()}_${req.file.originalname}`;
    const storageRef = ref(storage, fileName);

    // Upload to Firebase Storage
    const metadata = { contentType: req.file.mimetype };
    await uploadBytes(storageRef, req.file.buffer, metadata);
    const downloadURL = await getDownloadURL(storageRef);
    console.log(`File uploaded to Firebase: ${downloadURL}`);

    // Update provider's photo URL
    provider.photo = downloadURL;
    await provider.save();
    console.log(`Provider photo updated for user ${userId}: ${downloadURL}`);

    res.json({ message: 'Profile picture uploaded successfully', photo: downloadURL });
  } catch (err) {
    console.error('Profile picture upload error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;