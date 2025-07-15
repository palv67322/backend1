import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  service: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    name: String,
    price: Number,
    duration: String,
  },
  date: { type: String, required: true },
  slot: { type: String, required: true },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Booking', bookingSchema);