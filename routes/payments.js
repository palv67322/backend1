import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import auth from '../middleware/auth.js';
import Booking from '../models/Booking.js';
import Provider from '../models/Provider.js';
import Service from '../models/Service.js';
import User from '../models/User.js';
import sendEmail from '../utils/sendEmail.js';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: 'rzp_test_x1BNfcKz3XtHjz',
  key_secret: 'ZVCPvAhP8A1pxbVlB3OYHRkv',
});

// Create Razorpay order
router.post('/create-order', auth, async (req, res) => {
  try {
    const { amount, bookingId } = req.body;
    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `booking_${bookingId}`,
    };
    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: options.amount, currency: options.currency });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Verify payment
router.post('/verify-payment', auth, async (req, res) => {
  try {
    const { orderId, razorpayPaymentId, razorpaySignature, bookingId } = req.body;
    const body = orderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpaySignature) {
      const booking = await Booking.findById(bookingId).populate('provider');
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      const service = await Service.findById(booking.service._id);
      if (!service) return res.status(404).json({ message: 'Service not found' });

      const provider = await Provider.findById(booking.provider);
      if (!provider) return res.status(404).json({ message: 'Provider not found' });

      // Update booking status
      booking.paymentStatus = 'completed';
      await booking.save();

      // Remove slot from service availability
      const serviceAvailability = service.availability.find(a => a.date === booking.date);
      if (serviceAvailability) {
        serviceAvailability.slots = serviceAvailability.slots.filter(s => s !== booking.slot);
        if (serviceAvailability.slots.length === 0) {
          service.availability = service.availability.filter(a => a.date !== booking.date);
        }
        await service.save();
      }

      // Remove slot from provider availability
      const providerAvailability = provider.availability.find(a => a.date === booking.date);
      if (providerAvailability) {
        providerAvailability.slots = providerAvailability.slots.filter(s => s !== booking.slot);
        if (providerAvailability.slots.length === 0) {
          provider.availability = provider.availability.filter(a => a.date !== booking.date);
        }
        await provider.save();
      }

      // Fetch user and provider emails
      const user = await User.findById(req.user.id);
      const providerUser = await User.findById(booking.provider.user);
      if (!user || !providerUser) {
        console.error('User or provider user not found');
        return res.status(404).json({ message: 'User or provider user not found' });
      }

      // Send confirmation emails
      const userEmail = `
        <h1>Booking Confirmed</h1>
        <p>Your booking for ${booking.service.name} with ${booking.provider.name} is confirmed.</p>
        <p>Date: ${booking.date}</p>
        <p>Slot: ${booking.slot}</p>
        <p>Amount Paid: ₹${booking.service.price}</p>
        <p>Thank you for using Local Service Finder!</p>
      `;
      const providerEmail = `
        <h1>New Booking Confirmed</h1>
        <p>You have a new confirmed booking for ${booking.service.name} from ${user.name}.</p>
        <p>Date: ${booking.date}</p>
        <p>Slot: ${booking.slot}</p>
        <p>Amount: ₹${booking.service.price}</p>
        <p>Please prepare for the appointment.</p>
      `;
      try {
        await sendEmail({ to: user.email, subject: 'Booking Confirmation', html: userEmail });
        await sendEmail({ to: providerUser.email, subject: 'New Confirmed Booking', html: providerEmail });
        console.log(`Emails sent to ${user.email} and ${providerUser.email}`);
      } catch (emailErr) {
        console.error('Email sending error:', emailErr);
      }

      console.log(`Booking ${booking._id} confirmed, slot ${booking.slot} removed from availability`);

      res.json({ message: 'Payment verified and booking confirmed' });
    } else {
      res.status(400).json({ message: 'Invalid payment signature' });
    }
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;