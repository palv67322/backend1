import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  service: { type: String, required: true },
  location: { type: String, required: true },
  rating: { type: Number, default: 0 },
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  certifications: [{ type: String }],
  availability: [
    {
      date: { type: String },
      slots: [{ type: String }],
    },
  ],
  photo: { type: String },
});

export default mongoose.model('Provider', providerSchema);