import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import complaintRoutes from './routes/complaints.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/complaints', complaintRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`✓ EchoSign API running on http://localhost:${PORT}`);
  console.log(`  • Complaints: POST /api/complaints`);
  console.log(`  • Get status: GET /api/complaints/:id`);
  console.log(`  • List all: GET /api/complaints`);
  console.log(`  • Update: PUT /api/complaints/:id/status`);
});
