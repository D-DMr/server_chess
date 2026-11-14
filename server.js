const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Rota básica para verificar se está vivo
app.get('/', (req, res) => {
    res.send('Servidor de Xadrez Online a funcionar!');
});

let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Novo jogador ligado:', socket.id);

    socket.on('join_game', () => {
        if (waitingPlayer) {
            const room = waitingPlayer.id + '_' + socket.id;
            socket.join(room);
            waitingPlayer.join(room);

            waitingPlayer.emit('game_start', { room: room, color: 'white' });
            socket.emit('game_start', { room: room, color: 'black' });

            console.log('Jogo começou na sala:', room);
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
            socket.emit('waiting', "À espera de oponente...");
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('move', data.move);
    });
    
    socket.on('resign', (data) => {
        socket.to(data.room).emit('resign');
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        console.log('Jogador desligou:', socket.id);
    });
});

// Render usa a porta definida na variável PORT, ou a 10000 por defeito
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
