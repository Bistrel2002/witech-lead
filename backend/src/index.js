import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import apiRouter from './routes.js';
import authRouter from './routes/authRoutes.js';
import portalRouter from './routes/portalRoutes.js';
import { getDb } from './database/db.js';
import { authenticateUser } from './middlewares/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // In production, check against allowed list; in dev, allow all
    if (process.env.NODE_ENV === 'production') {
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      // Also allow any .onrender.com subdomain (for Render previews)
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      return callback(new Error('CORS not allowed'), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser(process.env.JWT_SECRET || 'witech-secret'));

// Auth Routes (Public)
app.use('/api/auth', authRouter);

// Portal Routes (Password/Role restricted)
app.use('/api/portal', portalRouter);

// API Routes (General CRM operations - Protected by User Login)
app.use('/api', authenticateUser, apiRouter);

// Health Check / Root route
app.get('/', (req, res) => {
  res.json({ message: "Witech Lead Backend API running..." });
});

// Start Server and Init DB
async function bootstrap() {
  try {
    console.log("Initializing database connection...");
    const db = await getDb();
    console.log("Database initialized successfully!");

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🚀 Witech Lead backend running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Frontend:    ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error("Critical: Failed to bootstrap backend server:", error);
    process.exit(1);
  }
}

bootstrap();

// Nodemon reload trigger
