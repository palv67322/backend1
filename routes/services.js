import express from 'express';
import Service from '../models/Service.js';
import Provider from '../models/Provider.js';
import auth from '../middleware/auth.js';
import sendEmail from '../utils/sendEmail.js';
import User from '../models/User.js';

const router = express.Router();

// Add service (provider only)
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'provider') {
    console.log(`Add service failed: User ${req.user.id} is not a provider`);
    return res.status(403).json({ message: 'Access denied: Only providers can add services' });
  }

  try {
    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) {
      console.log(`Provider not found for user ${req.user.id}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    const { name, description, price, duration, availability } = req.body;

    // Validate availability
    if (!availability || !Array.isArray(availability) || availability.length === 0) {
      return res.status(400).json({ message: 'At least one availability entry is required' });
    }
    for (const avail of availability) {
      if (!avail.date || !avail.slots || avail.slots.length === 0) {
        return res.status(400).json({ message: 'Each availability must have a date and at least one slot' });
      }
    }

    const service = new Service({
      provider: provider._id,
      name,
      description,
      price,
      duration,
      availability,
    });
    await service.save();

    // Update provider's availability
    availability.forEach((avail) => {
      const existingAvail = provider.availability.find(a => a.date === avail.date);
      if (existingAvail) {
        existingAvail.slots = [...new Set([...existingAvail.slots, ...avail.slots])]; // Merge unique slots
      } else {
        provider.availability.push(avail);
      }
    });
    provider.services.push(service._id);
    await provider.save();

    console.log(`Service ${service._id} added for provider ${provider._id}`);

    try {
      const user = await User.findById(req.user.id);
      const html = `
        <h1>New Service Added</h1>
        <p>You have successfully added a new service: ${name}</p>
        <p>Price: ₹${price}</p>
        <p>Duration: ${duration}</p>
        <p>Availability: ${availability.map(a => `${a.date}: ${a.slots.join(', ')}`).join('; ')}</p>
      `;
      await sendEmail({ to: user.email, subject: 'New Service Added', html });
      console.log(`Service confirmation email sent to ${user.email}`);
    } catch (emailErr) {
      console.error(`Failed to send service email to ${user.email}:`, emailErr);
    }

    res.status(201).json(service);
  } catch (err) {
    console.error('Add service error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Edit service (provider only)
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'provider') {
    console.log(`Edit service failed: User ${req.user.id} is not a provider`);
    return res.status(403).json({ message: 'Access denied: Only providers can edit services' });
  }

  try {
    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) {
      console.log(`Provider not found for user ${req.user.id}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log(`Service ${req.params.id} not found`);
      return res.status(404).json({ message: 'Service not found' });
    }

    if (service.provider.toString() !== provider._id.toString()) {
      console.log(`User ${req.user.id} not authorized to edit service ${service._id}`);
      return res.status(403).json({ message: 'Not authorized to edit this service' });
    }

    const { name, description, price, duration, availability } = req.body;

    // Validate availability
    if (!availability || !Array.isArray(availability) || availability.length === 0) {
      return res.status(400).json({ message: 'At least one availability entry is required' });
    }
    for (const avail of availability) {
      if (!avail.date || !avail.slots || avail.slots.length === 0) {
        return res.status(400).json({ message: 'Each availability must have a date and at least one slot' });
      }
    }

    // Update service
    service.name = name || service.name;
    service.description = description || service.description;
    service.price = price || service.price;
    service.duration = duration || service.duration;
    service.availability = availability || service.availability;
    await service.save();

    // Update provider's availability
    provider.availability = [];
    const allServices = await Service.find({ provider: provider._id });
    allServices.forEach(s => {
      s.availability.forEach(avail => {
        const existingAvail = provider.availability.find(a => a.date === avail.date);
        if (existingAvail) {
          existingAvail.slots = [...new Set([...existingAvail.slots, ...avail.slots])];
        } else {
          provider.availability.push(avail);
        }
      });
    });
    await provider.save();

    console.log(`Service ${service._id} updated for provider ${provider._id}`);

    try {
      const user = await User.findById(req.user.id);
      const html = `
        <h1>Service Updated</h1>
        <p>You have successfully updated the service: ${name}</p>
        <p>Price: ₹${price}</p>
        <p>Duration: ${duration}</p>
        <p>Availability: ${availability.map(a => `${a.date}: ${a.slots.join(', ')}`).join('; ')}</p>
      `;
      await sendEmail({ to: user.email, subject: 'Service Updated', html });
      console.log(`Service update email sent to ${user.email}`);
    } catch (emailErr) {
      console.error(`Failed to send service update email to ${user.email}:`, emailErr);
    }

    res.json(service);
  } catch (err) {
    console.error('Edit service error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Delete service (provider only)
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'provider') {
    console.log(`Delete service failed: User ${req.user.id} is not a provider`);
    return res.status(403).json({ message: 'Access denied: Only providers can delete services' });
  }

  try {
    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) {
      console.log(`Provider not found for user ${req.user.id}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log(`Service ${req.params.id} not found`);
      return res.status(404).json({ message: 'Service not found' });
    }

    if (service.provider.toString() !== provider._id.toString()) {
      console.log(`User ${req.user.id} not authorized to delete service ${service._id}`);
      return res.status(403).json({ message: 'Not authorized to delete this service' });
    }

    await Service.deleteOne({ _id: req.params.id });

    // Remove service from provider's services array
    provider.services = provider.services.filter(s => s.toString() !== req.params.id);
    // Update provider's availability
    provider.availability = [];
    const remainingServices = await Service.find({ provider: provider._id });
    remainingServices.forEach(s => {
      s.availability.forEach(avail => {
        const existingAvail = provider.availability.find(a => a.date === avail.date);
        if (existingAvail) {
          existingAvail.slots = [...new Set([...existingAvail.slots, ...avail.slots])];
        } else {
          provider.availability.push(avail);
        }
      });
    });
    await provider.save();

    console.log(`Service ${req.params.id} deleted for provider ${provider._id}`);

    try {
      const user = await User.findById(req.user.id);
      const html = `
        <h1>Service Deleted</h1>
        <p>You have successfully deleted the service: ${service.name}</p>
      `;
      await sendEmail({ to: user.email, subject: 'Service Deleted', html });
      console.log(`Service deletion email sent to ${user.email}`);
    } catch (emailErr) {
      console.error(`Failed to send service deletion email to ${user.email}:`, emailErr);
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get services for a provider
router.get('/my-services', auth, async (req, res) => {
  if (req.user.role !== 'provider') {
    console.log(`Get services failed: User ${req.user.id} is not a provider`);
    return res.status(403).json({ message: 'Access denied: Only providers can view their services' });
  }

  try {
    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) {
      console.log(`Provider not found for user ${req.user.id}`);
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    const services = await Service.find({ provider: provider._id });
    res.json(services);
  } catch (err) {
    console.error('Get services error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;