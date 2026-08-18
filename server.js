import { app } from './src/app.js';

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`AIODL listening on :${port}`));
