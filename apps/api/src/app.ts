import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { DOMAIN_PACKAGE_NAME } from '@cookout-ai/domain';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'CookOut AI Backend API',
    domainPackage: DOMAIN_PACKAGE_NAME,
    timestamp: new Date().toISOString(),
  });
});
