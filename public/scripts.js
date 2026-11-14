// COLA O TEU LINK DO RENDER AQUI
const socket = io('COLA_O_TEU_LINK_DO_RENDER_AQUI'); 

const game = new Chess();
let myColor = 'w';
let roomId = null;
let selectedSquare = null;
let isOnline = false;
let searchTimeout = null;

// Configurações escolhidas no Lobby
let configTime = '10+0';
let configMode = 'ranked';
let configColor = 'random';

// ==========================================
// NAVEGAÇÃO E LOBBY
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function selectTime(el, time) {
    document.querySelectorAll('.setup-section:nth-child(2) .option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    configTime = time;
}

function selectMode(el, mode) {
    document.querySelectorAll('.setup-section:nth-child(3) .option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    configMode = mode;
}

function selectColor(el, color) {
    document.querySelectorAll('.setup-section:nth-child(4) .option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    configColor = color;
}

function findMatch() {
    showScreen('searching-screen');
    
    // Simulação de procura (Aguarda 3 segundos e liga ao servidor)
    searchTimeout = setTimeout(() => {
        // O jogador escolheu as brancas, pretas ou aleatório
        let chosenColor = configColor;
        if (chosenColor === 'random') chosenColor = Math.random() < 0.5 ? 'w' : 'b';
        
        socket.emit('find_match', { 
            mode: configMode, 
            time: configTime, 
            color: chosenColor,
            name: "Jogador"
        });
    }, 3000);
}

function cancelSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    showScreen('online-screen');
}

// Eventos do Servidor
socket.on('match_found', (data) => {
    isOnline = true;
    myColor = data.color;
    roomId = data.roomId;
    
    document.getElementById('opp-name').innerText = data.opponent;
    document.getElementById('my-name').innerText = "Tu";
    
    showScreen('game-screen');
    game.reset();
    drawBoard();
});

socket.on('move', (move) => {
    game.move(move);
    drawBoard();
    updateHistory(move);
});

// ==========================================
// JOGAR VS IA
// ==========================================
function startAI() {
    isOnline = false;
    myColor = 'w';
    document.getElementById('opp-name').innerText = "Computador";
    document.getElementById('my-name').innerText = "Tu";
    showScreen('game-screen');
    game.reset();
    drawBoard();
}

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
            if (piece) sq.innerText = getPieceSymbol(piece.color, piece.type);

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
                socket.emit('move', { roomId: roomId, move: { from: move.from, to: move.to, promotion: move.promotion } });
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
    return score + Math.random() * 5;
}

// ==========================================
// UTILITÁRIOS
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
