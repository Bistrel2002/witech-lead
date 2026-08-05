import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import apiRouter from './routes.js';
import authRouter from './routes/authRoutes.js';
import portalRouter from './routes/portalRoutes.js';
import sesWebhookRouter from './routes/sesWebhookRoutes.js';
import { getDb } from './database/db.js';
import { getPlatformConfig } from './config/platformConfig.js';
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

// AWS SNS delivers SES events unauthenticated and as text/plain.
app.use('/api/ses', express.text({ type: '*/*' }), sesWebhookRouter);

// API Routes (General CRM operations - Protected by User Login)
app.use('/api', authenticateUser, apiRouter);

// Health Check / Root route
app.get('/', (req, res) => {
  res.json({ message: "Witech Lead Backend API running..." });
});

// Start Server and Init DB
async function bootstrap() {
  try {
    // Fail loudly here rather than silently per-customer later.
    //
    // Every consumer of the platform config calls getPlatformConfig() lazily
    // and swallows the throw, so a deploy missing AWS_REGION,
    // MAIL_ROOT_DOMAIN, the Twilio triple or SES_WEBHOOK_TOKEN used to boot,
    // pass its health check and look completely healthy — while being unable
    // to send anything and unable to attribute a single bounce. The first
    // signal was a customer complaining. The thrown message already names
    // every missing variable.
    console.log("Validating platform configuration...");
    try {
      getPlatformConfig();
      console.log("Platform configuration OK.");
    } catch (configError) {
      if (process.env.NODE_ENV === 'production') throw configError;
      // Local dev must stay bootable without real AWS/Twilio credentials —
      // .env.example deliberately ships those blank — but the warning is loud
      // enough that nobody mistakes a half-configured box for a working one.
      console.warn("====================================================");
      console.warn("⚠️  Platform configuration incomplete — outreach sending will NOT work.");
      console.warn(`   ${configError.message}`);
      console.warn("   Tolerated because NODE_ENV is not 'production'. A production boot aborts here.");
      console.warn("====================================================");
    }

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
