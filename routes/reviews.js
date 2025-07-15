import express from 'express';
import Review from '../models/Review.js';
import Provider from '../models/Provider.js';
import Booking from '../models/Booking.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Submit a review
router.post('/', auth, async (req, res) => {
  try {
    const { providerId, bookingId, rating, comment } = req.body;

    // Validate booking
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.user.toString() !== req.user.id || booking.paymentStatus !== 'completed') {
      return res.status(400).json({ message: 'Invalid or incomplete booking' });
    }

    // Check if review already exists for this booking
    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return res.status(400).json({ message: 'Review already submitted for this booking' });
    }

    const review = new Review({
      user: req.user.id,
      provider: providerId,
      booking: bookingId,
      rating,
      comment,
    });
    await review.save();

    // Update provider's reviews and rating
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    provider.reviews.push(review._id);
    const reviews = await Review.find({ provider: providerId });
    provider.rating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
    await provider.save();

    console.log(`Review submitted for provider ${providerId}, booking ${bookingId}`);
    res.json(review);
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get reviews for a provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const reviews = await Review.find({ provider: req.params.providerId }).populate('user', 'name');
    res.json(reviews);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;