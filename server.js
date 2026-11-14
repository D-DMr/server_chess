const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // <--- ESTA LINHA É CRUCIAL

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // <--- E ESTA TAMBÉM
    methods: ["GET", "POST"]
  }
});

// ... resto do código ...
