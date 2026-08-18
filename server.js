import './src/bootstrap.js';
import { app } from './src/app.js';

const port = Number(process.env.PORT || 3000);

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`AIODL listening on :${port}`));
}

export default app;
