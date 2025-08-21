const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 8000;
const app = express();

app.use(express.static(path.join(__dirname, 'client/build')));
app.use(cors());

const upload = multer({ dest: 'uploads/' });

// WhatsApp client without session
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', qr => {
  console.log('Scan this QR code:');
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
});

client.on('authenticated', () => {
  console.log('Authenticated!');
});

client.on('auth_failure', (msg) => {
  console.error('AUTH FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client disconnected', reason);
});

client.initialize();

const delay = ms => new Promise(res => setTimeout(res, ms));

// API endpoint to upload Excel and send messages
app.post('/send-whatsapp', upload.single('file'), async (req, res) => {
  if (!client.info || !client.info.wid) {
    return res.status(503).json({ error: 'WhatsApp client not ready yet. Scan QR and try again.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = path.resolve(req.file.path);
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.Mobile) {
        console.log(`Skipping row ${i + 1}: No Number`);
        continue;
      }
      const phoneRaw = `91${row.Mobile.toString().replace(/\D/g, '')}`;
      const number = phoneRaw.endsWith('@c.us') ? phoneRaw : `${phoneRaw}@c.us`;
      const name = row.Name || row.name || '';
      const message = row.Message || `Hello, ${name} from Md Khalid, Here is your image!`;
      const imageUrl = row.ImageUrl || row.ImageURL || row.imageUrl || row.imageURL || '';

      try {
        if (imageUrl) {
          const { MessageMedia } = require('whatsapp-web.js');
          const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
          await client.sendMessage(number, media, { caption: message });
          console.log(`Sent image to ${row.Mobile}`);
        } else {
          await client.sendMessage(number, message);
          console.log(`Sent message to ${row.Mobile}`);
        }
      } catch (err) {
        console.error(`Error sending to ${row.Mobile}:`, err.message);
      }

      await delay(2000);
    }

    fs.unlinkSync(filePath);
    res.json({ status: 'Messages sent (or attempted) to all numbers in Excel.' });
  } catch (error) {
    fs.unlinkSync(filePath);
    console.error('Error processing file:', error.message);
    res.status(500).json({ error: 'Failed to process file.' });
  }
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Server started on port', PORT);
});
