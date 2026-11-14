// COLA O TEU LINK DO RENDER AQUI
const socket = io('COLA_O_TEU_LINK_DO_RENDER_AQUI'); 

const game = new Chess();
let myColor = 'w';
let roomId = null;
let selectedSquare = null;
let isOnline = false;

// ==========================================
// NAVEGAÇÃO E MENUS
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function startAI() {
    isOnline = false;
    myColor = 'w';
    document.getElementById('opp-name').innerText = "Computador";
    showScreen('game-screen');
    game.reset();
    drawBoard();
}

// ==========================================
// LIGAÇÃO AO SERVIDOR (ONLINE)
// ==========================================
function createRoom() {
    const name = document.getElementById('player-name').value || "Jogador";
    socket.emit('create_room', { name });
}

function joinRoom() {
    const name = document.getElementById('player-name').value || "Jogador";
    const code = document.getElementById('join-code').value.toUpperCase();
    if(!code) return alert("Insere o código da sala!");
    socket.emit('join_room', { name, roomId: code });
}

socket.on('room_created', (data) => {
    isOnline = true;
    roomId = data.roomId;
    myColor = 'w'; 
    document.getElementById('my-name').innerText = document.getElementById('player-name').value || "Tu";
    document.getElementById('opp-name').innerText = "À espera...";
    showScreen('game-screen');
    game.reset();
    drawBoard();
});

socket.on('game_start', (data) => {
    isOnline = true;
    myColor = 'b'; 
    document.getElementById('opp-name').innerText = data.players.find(p => p.id !== socket.id)?.name || "Oponente";
    showScreen('game-screen');
    game.load(data.fen);
    drawBoard();
});

socket.on('move', (move) => {
    game.move(move);
    drawBoard();
    updateHistory(move);
});

socket.on('error_msg', (msg) => alert(msg));

// ==========================================
// RENDERIZAÇÃO E JOGO
// ==========================================
function drawBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const boardState = game.board(); 

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            sq.className = `sq ${isLight ? 'light' : 'dark'}`;
            
            const file = String.fromCharCode(97 + c);
            const rank = 8 - r;
            const coord = file + rank;

            const piece = boardState[r][c];
            if (piece) {
                sq.innerText = getPieceSymbol(piece.color, piece.type);
            }

            if (selectedSquare === coord) sq.classList.add('highlight');
            
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

    if (selectedSquare) {
        const move = game.move({ from: selectedSquare, to: coord, promotion: 'q' });
        if (move) {
            selectedSquare = null;
            drawBoard();
            updateHistory(move);
            
            if (isOnline) {
                socket.emit('move', { roomId: roomId, fen: game.fen(), move: { from: move.from, to: move.to, promotion: move.promotion } });
            } else {
                setTimeout(makeAIMove, 500);
            }
            return;
        }
    }

    const piece = game.get(coord);
    if (piece && piece.color === myColor) {
        selectedSquare = coord;
    } else {
        selectedSquare = null;
    }
    drawBoard();
}

// ==========================================
// INTELIGÊNCIA ARTIFICIAL
// ==========================================
function makeAIMove() {
    if (game.game_over()) return;
    const moves = game.moves();
    if (moves.length === 0) return;

    let bestMove = null;
    let bestScore = -Infinity;

    for (let move of moves) {
        game.move(move);
        let score = evaluateBoard();
        game.undo();

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    if (bestMove) {
        const moveObj = game.move(bestMove);
        drawBoard();
        updateHistory(moveObj);
    }
}

function evaluateBoard() {
    const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };
    let score = 0;
    const board = game.board();
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const val = pieceValues[piece.type];
                if (piece.color === 'b') score += val;
                else score -= val;
            }
        }
    }
    return score + Math.random() * 5; // Aleatoriedade para variar
}

// ==========================================
// UTILS
// ==========================================
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
