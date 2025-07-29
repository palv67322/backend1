import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  service: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    default: 0
  },
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: Number,
    comment: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  services: [{
    type: String
  }],
  certifications: [{
    type: String
  }],
  availability: [{
    date: Date,
    slots: [String]
  }],
  photo: {
    type: String,
    default: null // Store Firebase Storage URL
  }
});

export default mongoose.model('Provider', providerSchema);