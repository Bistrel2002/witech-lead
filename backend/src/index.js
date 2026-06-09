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
app.use(cors({
  origin: true,
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

    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Witech Lead backend running on: http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error("Critical: Failed to bootstrap backend server:", error);
    process.exit(1);
  }
}

bootstrap();

// Nodemon reload trigger
