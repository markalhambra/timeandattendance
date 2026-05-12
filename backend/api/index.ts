// Vercel serverless entry point — exports the Express app as the default handler.
// Vercel does not call app.listen(); it invokes the exported handler directly.
import app from '../src/app';

export default app;
