import mongoose from 'mongoose';
import { config } from './config';

// Connect to MongoDB
// Mongoose handles connection pooling automatically
export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Export mongoose for use in models
export default mongoose;
