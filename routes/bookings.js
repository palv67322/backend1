import express from 'express';
import Booking from '../models/Booking.js';
import Provider from '../models/Provider.js';
import Service from '../models/Service.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Create booking
router.post('/', auth, async (req, res) => {
  try {
    const { providerId, serviceId, date, slot } = req.body;
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    // Check availability in service
    const serviceAvailability = service.availability.find(a => a.date === date);
    if (!serviceAvailability || !serviceAvailability.slots.includes(slot)) {
      return res.status(400).json({ message: 'Slot not available in service' });
    }

    // Check availability in provider
    const providerAvailability = provider.availability.find(a => a.date === date);
    if (!providerAvailability || !providerAvailability.slots.includes(slot)) {
      return res.status(400).json({ message: 'Slot not available in provider' });
    }

    const booking = new Booking({
      user: req.user.id,
      provider: providerId,
      service: {
        _id: serviceId,
        name: service.name,
        price: service.price,
        duration: service.duration,
      },
      date,
      slot,
      paymentStatus: 'pending', // Explicitly set as pending
    });
    await booking.save();

    console.log(`Booking ${booking._id} created with status: pending`);

    res.json(booking);
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get user bookings
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id }).populate('provider');
    res.json(bookings);
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;