const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const accountSid = "ACa98209d101169908e2bc878358242f20";
const authToken = "b1bae37dc89e63c73bd4f934202383f4";
// const client = require('twilio')(accountSid, authToken);

const app = express();
// // Serve static React files
app.use(express.static(path.join(__dirname, 'client/build')));
app.use(cors());

// API routes here ...
const upload = multer({ dest: 'uploads/' });

// app.post('/send-bulk-messages', upload.single('file'), async (req, res) => {
//   try {
//     const filePath = req.file.path;
//     const workbook = xlsx.readFile(filePath);
//     const sheetName = workbook.SheetNames[0];
//     const sheet = workbook.Sheets[sheetName];
//     const data = xlsx.utils.sheet_to_json(sheet);

//     // data: [{ Name, Mobile, ImageUrl }, ...]
//     const results = [];
//     for (const row of data) {
//       let rawNumber = row.Mobile || row.mobile || row.Number || row.number || '';
//       rawNumber = String(rawNumber).replace(/\D/g, ''); // Remove non-digits
//       let to = rawNumber.startsWith('91') ? `whatsapp:+${rawNumber}` : rawNumber.startsWith('+') ? `whatsapp:${rawNumber}` : `whatsapp:+91${rawNumber}`;
//       const name = row.Name || row.name || '';
//       const imageUrl = row.ImageURL || row.ImageUrl || row.imageUrl || row.imageURL || '';
//       const body = `Hello ${name}, this is your image!`;
//       const mediaUrl = imageUrl ? [imageUrl] : undefined;
//       console.log({ to, body, mediaUrl });
//       try {
//         const message = await client.messages.create({
//           from: 'whatsapp:+14155238886',
//           to,
//           body,
//           ...(mediaUrl && { mediaUrl }),
//         });
//         results.push({ to, status: 'sent', sid: message.sid });
//       } catch (err) {
//         console.error('Twilio error:', err);
//         results.push({ to, status: 'failed', error: err.message, details: err });
//       }
//     }
//     fs.unlinkSync(filePath); // Clean up uploaded file
//     res.json({ results });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Initialize WhatsApp client with persistent auth
const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', qr => {
  console.log('Scan this QR code:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
});

client.on('auth_failure', msg => {
  console.error('Authentication failure:', msg);
});

client.initialize();

// Helper delay function
const delay = ms => new Promise(res => setTimeout(res, ms));

// API endpoint to upload Excel and send messages
app.post('/send-whatsapp', upload.single('file'), async (req, res) => {
  if (!client.info || !client.info.wid) {
    return res.status(503).json({ error: 'WhatsApp client not ready yet. Try again later.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = path.resolve(req.file.path);
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log('rows', rows)

    // Send messages sequentially with delay
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
          // Send image with caption
          const { MessageMedia } = require('whatsapp-web.js');
          const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
          await client.sendMessage(number, media, { caption: message });
          console.log(`Sent image to ${row.Mobile}`);
        } else {
          // Send only text message
          await client.sendMessage(number, message);
          console.log(`Sent message to ${row.Mobile}`);
        }
      } catch (err) {
        console.error(`Error sending to ${row.Mobile}:`, err.message);
      }

      await delay(2000); // 2 seconds delay
    }

    // Delete uploaded file after processing
    fs.unlinkSync(filePath);

    res.json({ status: 'Messages sent (or attempted) to all numbers in Excel.' });
  } catch (error) {
    fs.unlinkSync(filePath);
    console.error('Error processing file:', error.message);
    res.status(500).json({ error: 'Failed to process file.' });
  }
});

// Global error handler for enhanced debugging
app.use((err, req, res, next) => {
  console.error('--- Express Error Handler ---');
  console.error(err.stack || err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// // For any other route, serve React index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});
app.listen(8000, () => {
  console.log('Server started on port 8000');
});