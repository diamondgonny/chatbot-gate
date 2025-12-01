import mongoose from 'mongoose';
import { config } from './config';
import { mongoConnectionState, getDeploymentEnv } from './metrics/metricsRegistry';

// Connect to MongoDB
// Mongoose handles connection pooling automatically
export const connectDB = async () => {
  try {
    if (!config.mongoUri) {
      console.error('❌ MONGO_URI is not set. Refusing to start without a database connection string.');
      process.exit(1);
    }
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected successfully');

    // Set up MongoDB connection state metrics
    const deploymentEnv = getDeploymentEnv();

    mongoose.connection.on('connected', () => {
      mongoConnectionState.labels(deploymentEnv).set(1);
    });

    mongoose.connection.on('disconnected', () => {
      mongoConnectionState.labels(deploymentEnv).set(0);
    });

    mongoose.connection.on('connecting', () => {
      mongoConnectionState.labels(deploymentEnv).set(2);
    });

    mongoose.connection.on('disconnecting', () => {
      mongoConnectionState.labels(deploymentEnv).set(3);
    });

    // Set initial state
    mongoConnectionState.labels(deploymentEnv).set(mongoose.connection.readyState);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Export mongoose for use in models
export default mongoose;
