import cors from 'cors';
import { app, query, errorHandler } from 'mu';

app.use(cors());

app.get('/bundleAllFiles', async (req, res) => {
  res.send('lollig');
});

app.use(errorHandler);
