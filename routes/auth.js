import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Provider from '../models/Provider.js';
import sendEmail from '../utils/sendEmail.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Password validation regex: at least 6 characters, including 1 letter, 1 number
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    if (!passwordRegex.test(password)) {
      console.log(`Registration failed: Invalid password for ${email}`);
      return res.status(400).json({ message: 'Password must be at least 6 characters with at least one letter and one number' });
    }

    let user = await User.findOne({ email });
    if (user) {
      console.log(`Registration failed: User already exists for email ${email}`);
      return res.status(400).json({ message: 'User already exists' });
    }

    user = new User({ name, email, password, role });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();
    console.log(`User created: ${user._id}, role: ${role}`);

    if (role === 'provider') {
      try {
        const provider = new Provider({
          user: user._id,
          name,
          service: 'General Service',
          location: 'Unknown',
          rating: 0,
          reviews: [],
          services: [],
          certifications: [],
          availability: [],
          photo: null // Default to null; upload handled separately
        });
        await provider.save();
        console.log(`Provider created for user ${user._id}: ${provider._id}`);
      } catch (providerErr) {
        console.error(`Failed to create Provider for user ${user._id}:`, providerErr);
        await User.deleteOne({ _id: user._id });
        return res.status(500).json({ message: 'Failed to create provider profile: ' + providerErr.message });
      }
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    user.refreshToken = refreshToken;
    await user.save();
    console.log(`Tokens generated for user ${user._id}`);

    try {
      const html = `
        <h1>Welcome to Local Service Finder, ${name}!</h1>
        <p>Your account has been successfully created as a ${role}.</p>
        <p>Login at <a href="http://localhost:3000">Local Service Finder</a> to get started.</p>
      `;
      await sendEmail({ to: email, subject: 'Welcome to Local Service Finder', html });
      console.log(`Welcome email sent to ${email}`);
    } catch (emailErr) {
      console.error(`Failed to send welcome email to ${email}:`, emailErr);
    }

    res.json({ token, refreshToken, user: { id: user._id, name, email, role } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Create Provider for existing user
router.post('/create-provider', auth, async (req, res) => {
  if (req.user.role !== 'provider') {
    console.log(`Create provider failed: User ${req.user.id} is not a provider`);
    return res.status(403).json({ message: 'Access denied: User is not a provider' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log(`User not found for ID ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    const existingProvider = await Provider.findOne({ user: user._id });
    if (existingProvider) {
      console.log(`Provider already exists for user ${user._id}`);
      return res.status(400).json({ message: 'Provider profile already exists' });
    }

    const provider = new Provider({
      user: user._id,
      name: user.name,
      service: 'General Service',
      location: 'Unknown',
      rating: 0,
      reviews: [],
      services: [],
      certifications: [],
      availability: [],
      photo: null // Default to null; upload handled separately
    });
    await provider.save();
    console.log(`Provider created for existing user ${user._id}: ${provider._id}`);

    res.json({ provider });
  } catch (err) {
    console.error('Create provider error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log(`Login attempt for ${email}`);
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`Login failed: No user found for email ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`Login failed: Invalid password for email ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    user.refreshToken = refreshToken;
    await user.save();
    console.log(`User logged in: ${user._id}`);

    res.json({ token, refreshToken, user: { id: user._id, name: user.name, email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      console.log(`User not found for ID ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    console.log('Refresh token request failed: No refresh token provided');
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      console.log(`Refresh token invalid for user ${decoded.id}`);
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const newToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log(`New token issued for user ${user._id}`);
    res.json({ token: newToken, refreshToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

// Update Profile
router.put('/profile', auth, async (req, res) => {
  const { name, email } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log(`User not found for ID ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    await user.save();

    if (user.role === 'provider') {
      const provider = await Provider.findOne({ user: user._id });
      if (provider) {
        provider.name = name || provider.name;
        await provider.save();
        console.log(`Provider profile updated for user ${user._id}`);
      }
    }

    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Forgot password - Send OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`User not found for forgot password: ${email}`);
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    const emailContent = `
      <h1>Password Reset OTP</h1>
      <p>Your OTP for password reset is: <strong>${otp}</strong></p>
      <p>This OTP is valid for 10 minutes.</p>
    `;
    await sendEmail({ to: email, subject: 'Password Reset OTP', html: emailContent });
    console.log(`OTP sent to ${email}: ${otp}`);

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(`Verifying OTP for ${email}: ${otp}`);
    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      console.log(`Invalid or expired OTP for ${email}: ${otp}`);
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    console.log(`OTP verified for ${email}`);
    res.json({ message: 'OTP verified' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    console.log(`Reset password attempt for ${email}, OTP: ${otp}, newPassword: ${newPassword}`);
    if (!passwordRegex.test(newPassword)) {
      console.log(`Invalid password for ${email}: Must be at least 6 characters with one letter and one number`);
      return res.status(400).json({ message: 'Password must be at least 6 characters with at least one letter and one number' });
    }

    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      console.log(`Invalid or expired OTP for ${email}: ${otp}`);
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = undefined; // Clear refresh token to avoid session issues
    await user.save();

    console.log(`Password reset for ${email}, new hashed password: ${hashedPassword}`);

    const emailContent = `
      <h1>Password Reset Successful</h1>
      <p>Your password has been successfully reset.</p>
      <p>You can now log in with your new password.</p>
    `;
    await sendEmail({ to: email, subject: 'Password Reset Confirmation', html: emailContent });
    console.log(`Confirmation email sent to ${email}`);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;