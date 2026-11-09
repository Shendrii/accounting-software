import app from './app.js';
import { wakeDocumentIndexer } from './lib/aiDocumentIndex.js';

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void wakeDocumentIndexer();
});
