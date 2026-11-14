// LIGAÇÃO AO SERVIDOR (No Render ele liga automaticamente ao host atual)
const socket = io(); 
const game = new Chess();
let myColor = null;
let roomId = null;
let selectedSquare = null;

socket.on('room_created', (data) => {
    roomId = data.roomId;
    myColor = data.color;
    initGameUI(`Sala: ${roomId}`);
});

socket.on('game_start', (data) => {
    myColor = data.players.find(p => p.id === socket.id).color;
    document.getElementById('opp-name').innerText = data.players.find(p => p.id !== socket.id).name;
    initGameUI(`Sala: ${roomId}`);
    game.load(data.fen);
    drawBoard();
});

socket.on('move', (move) => {
    game.move(move);
    drawBoard();
    updateHistory(move);
});

socket.on('error_msg', (msg) => alert(msg));

// --- AÇÕES DO MENU ---
function createRoom() {
    const name = document.getElementById('player-name').value || "Jogador";
    socket.emit('create_room', { name });
}

function joinRoom() {
    const name = document.getElementById('player-name').value || "Jogador";
    const roomId = document.getElementById('join-code').value.toUpperCase();
    if(!roomId) return alert("Insere o código!");
    socket.emit('join_room', { name, roomId });
}

function initGameUI(roomText) {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('room-display').innerText = roomText;
    document.getElementById('my-name').innerText = document.getElementById('player-name').value || "Tu";
    drawBoard();
}

// --- RENDERIZAÇÃO DO TABULEIRO ---
function drawBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const boardState = game.board(); // Matriz 8x8 da biblioteca chess.js

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            sq.className = `sq ${isLight ? 'light' : 'dark'}`;
            
            // Coordenada (ex: e4)
            const file = String.fromCharCode(97 + c);
            const rank = 8 - r;
            const coord = file + rank;
            sq.dataset.square = coord;

            // Peça
            const piece = boardState[r][c];
            if (piece) {
                sq.innerText = getPieceSymbol(piece.color, piece.type);
            }

            // Highlights
            if (selectedSquare === coord) sq.classList.add('highlight');
            
            // Mostrar movimentos válidos apenas se for a minha vez
            if (game.turn() === myColor && selectedSquare) {
                const moves = game.moves({ square: selectedSquare, verbose: true });
                if (moves.some(m => m.to === coord)) {
                    sq.classList.add(game.get(coord) ? 'valid-capture' : 'valid-move');
                }
            }

            sq.onclick = () => handleSquareClick(coord);
            boardEl.appendChild(sq);
        }
    }
}

function handleSquareClick(coord) {
    if (game.game_over() || game.turn() !== myColor) return;

    // Se já clicou numa peça
    if (selectedSquare) {
        const move = game.move({ from: selectedSquare, to: coord, promotion: 'q' });
        if (move) {
            selectedSquare = null;
            drawBoard();
            updateHistory(move);
            // Enviar para o servidor para o outro jogador ver
            socket.emit('move', { roomId: roomId, fen: game.fen(), move: { from: move.from, to: move.to, promotion: move.promotion } });
            return;
        }
    }

    // Selecionar nova peça
    const piece = game.get(coord);
    if (piece && piece.color === myColor) {
        selectedSquare = coord;
    } else {
        selectedSquare = null;
    }
    drawBoard();
}

function getPieceSymbol(color, type) {
    const symbols = {
        'w': { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
        'b': { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
    };
    return symbols[color][type];
}

function updateHistory(move) {
    const list = document.getElementById('move-history');
    const li = document.createElement('li');
    li.innerText = `${move.color === 'w' ? 'Brancas' : 'Pretas'}: ${move.san}`;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
}

function resign() {
    if(confirm("Tens a certeza que queres desistir?")) {
        alert("Desististe. O oponente ganhou.");
        location.reload();
    }
}
