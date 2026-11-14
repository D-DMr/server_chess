const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Servir os ficheiros estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Lógica de Salas
const rooms = {};

io.on('connection', (socket) => {
    console.log('Jogador conectado:', socket.id);

    socket.on('create_room', (data) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            players: [{ id: socket.id, color: 'w', name: data.name }],
            fen: 'start'
        };
        socket.join(roomId);
        socket.emit('room_created', { roomId, color: 'w' });
    });

    socket.on('join_room', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players.length === 1) {
            room.players.push({ id: socket.id, color: 'b', name: data.name });
            socket.join(data.roomId);
            
            // Avisa ambos que o jogo começou
            io.to(data.roomId).emit('game_start', {
                fen: room.fen,
                players: room.players
            });
        } else {
            socket.emit('error_msg', 'Sala cheia ou não existe.');
        }
    });

    socket.on('move', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.fen = data.fen; // Atualiza o estado do jogo
            socket.to(data.roomId).emit('move', data.move);
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desligado:', socket.id);
        // Limpar salas vazias
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
