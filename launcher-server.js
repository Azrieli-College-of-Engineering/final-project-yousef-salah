const express = require('express');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'launcher.html'));
});

app.listen(PORT, () => {
  console.log(`Launcher running at http://localhost:${PORT}`);
});