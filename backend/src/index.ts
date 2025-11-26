import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db';

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize the Express application
// In Spring, this is similar to the ApplicationContext.
// In FastAPI, this is `app = FastAPI()`.
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware Configuration
// ------------------------

// CORS (Cross-Origin Resource Sharing)
// Allows our frontend (running on a different port) to communicate with this backend.
// Similar to @CrossOrigin in Spring or CORSMiddleware in FastAPI.
app.use(cors());

// JSON Parser
// Automatically parses incoming JSON payloads in requests (Content-Type: application/json).
// Populates `req.body` with the parsed data.
// In Spring, this is handled by Jackson automatically for @RequestBody.
// In FastAPI, Pydantic models handle this.
app.use(express.json());

import gateRoutes from './routes/gateRoutes';
import chatRoutes from './routes/chatRoutes';
import sessionRoutes from './routes/sessionRoutes';

// ... (previous middleware)

// Routes
// ------

// Mount the Gate routes under /api/gate
app.use('/api/gate', gateRoutes);

// Mount the Chat routes under /api/chat
app.use('/api/chat', chatRoutes);

// Mount the Session routes under /api/sessions
app.use('/api/sessions', sessionRoutes);

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  // res.json() sends a JSON response with status 200 by default.
  // Equivalent to returning a Dict/Pydantic model in FastAPI or ResponseEntity in Spring.
  res.json({ status: 'ok', message: 'Chatbot Gate Backend is running' });
});

// Basic Error Handling Middleware
// Express uses a middleware function with 4 arguments (err, req, res, next) to handle errors.
// This catches any errors thrown in routes.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
