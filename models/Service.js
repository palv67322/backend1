import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: String, required: true },
  availability: [{ date: String, slots: [String] }],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Service', serviceSchema);