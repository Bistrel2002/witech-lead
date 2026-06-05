import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes.js';
import { getDb } from './database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// API Routes
app.use('/api', apiRouter);

// Health Check / Root route
app.get('/', (req, res) => {
  res.json({ message: "Witech Lead Backend API running..." });
});

// Start Server and Init DB
async function bootstrap() {
  try {
    console.log("Initializing local SQLite database...");
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
