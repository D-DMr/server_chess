// Servidor WebSocket do Xadrez
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permite o teu GitHub Pages ligar
    methods: ["GET", "POST"]
  }
});

// Salas de jogo
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Novo jogador ligado:', socket.id);

    socket.on('join_game', () => {
        if (waitingPlayer) {
            // Encontrou um oponente
            const room = waitingPlayer.id + '_' + socket.id;
            socket.join(room);
            waitingPlayer.join(room);

            const whitePlayer = waitingPlayer.id;
            const blackPlayer = socket.id;

            // Envia as cores
            waitingPlayer.emit('game_start', { room: room, color: 'white' });
            socket.emit('game_start', { room: room, color: 'black' });

            console.log('Jogo começou na sala:', room);
            waitingPlayer = null;
        } else {
            // Fica à espera
            waitingPlayer = socket;
            socket.emit('waiting', "À espera de oponente...");
        }
    });

    socket.on('move', (data) => {
        // Repassa o movimento para o oponente na mesma sala
        socket.to(data.room).emit('move', data.move);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        console.log('Jogador desligou:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});