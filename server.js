const express = require("express");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");
const crypto = require("crypto");
const Busboy = require("busboy"); // Make sure this import is correct

const app = express();
const port = 3000;

// Encryption key and algorithm
const ENCRYPTION_KEY = crypto.randomBytes(32); // 256-bit key
const IV = crypto.randomBytes(16); // Initialization vector

// Transform stream for encrypting data
class EncryptStream extends Transform {
  constructor() {
    super();
    this.cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, IV);
  }

  _transform(chunk, encoding, callback) {
    try {
      const encrypted = this.cipher.update(chunk);
      callback(null, encrypted);
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      const finalEncrypted = this.cipher.final();
      callback(null, finalEncrypted);
    } catch (err) {
      callback(err);
    }
  }
}

// Transform stream for decrypting data
class DecryptStream extends Transform {
  constructor() {
    super();
    this.decipher = crypto.createDecipheriv("aes-256-ctr", ENCRYPTION_KEY, IV);
  }

  _transform(chunk, encoding, callback) {
    try {
      const decrypted = this.decipher.update(chunk);
      callback(null, decrypted);
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      const finalDecrypted = this.decipher.final();
      callback(null, finalDecrypted);
    } catch (err) {
      callback(err);
    }
  }
}

// Route to handle file uploads
app.post("/upload", (req, res) => {
  const busboy = Busboy({ headers: req.headers });

  busboy.on("file", async (name, file ,info) => {
    const {filename,encoding,mimetype} = info;
    console.log(`Uploading file: ${filename}`);

    // Define the upload path for encrypted files
    const savePath = path.join(__dirname, "uploads", `${filename}.enc`);
    const writeStream = fs.createWriteStream(savePath);

    try {
      // Use pipeline with busboy and the EncryptStream
      await pipeline(
        file,
        new EncryptStream(), // Encrypt the file during the upload
        writeStream
      );

      console.log(`File encrypted and saved as ${filename}.enc`);
    } catch (err) {
      console.error("Error processing file upload:", err);
      res.status(500).send("File upload failed");
    }
  });

  busboy.on("finish", () => {
    res.status(200).send("Upload complete!");
  });

  req.pipe(busboy);
});

// Route to handle file decryption and download
app.get("/download/:filename", async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "uploads", `${filename}.enc`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const readStream = fs.createReadStream(filePath);

  try {
    // Use pipeline with DecryptStream to decrypt file while downloading
    await pipeline(
      readStream,
      new DecryptStream(), // Decrypt the file during the download
      res
    );
  } catch (err) {
    console.error("Error decrypting file:", err);
    res.status(500).send("File download failed");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
