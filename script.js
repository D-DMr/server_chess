// ==========================================
// LIGAÇÃO AO SERVIDOR RENDER (WEBSOCKET)
// ==========================================
// COLA O TEU LINK DO RENDER AQUI (ex: https://neon-chess.onrender.com)
const socket = io('https://server-chess-zazq.onrender.com'); 
let roomId = null;

function getDB() { return JSON.parse(localStorage.getItem('neon_db')) || {}; }
function saveDB(db) { localStorage.setItem('neon_db', JSON.stringify(db)); }
let currentUserEmail = localStorage.getItem('current_email') || null;

function showToast(msg) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
}

function switchView(viewId, btnElement) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function updateProfileUI() {
    const db = getDB();
    let name = "Convidado", pts = 1200;
    if (currentUserEmail && db[currentUserEmail]) { name = db[currentUserEmail].name; pts = db[currentUserEmail].points; }
    document.getElementById('dash-name').innerText = name;
    document.getElementById('dash-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('dash-rating').innerText = pts;
    document.getElementById('game-name').innerText = name;
    document.getElementById('game-rating').innerText = pts;
}

function openLogin() { openModal('login-modal'); }
function doLogin() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const name = document.getElementById('login-name').value.trim();
    if (!email || !name) return showToast("Preenche os campos");
    const db = getDB();
    if (!db[email]) db[email] = { name: name, points: 1200 };
    else db[email].name = name;
    saveDB(db); currentUserEmail = email; localStorage.setItem('current_email', email);
    closeModal('login-modal'); updateProfileUI();
}

// --- MOTOR DE XADREZ (CHESS.COM STYLE) ---
const boardEl = document.getElementById('board');
let board = new Array(64).fill(null);
let turn = 'w', selectedSquare = null, legalMovesForSelected = [], history = [], moveNumber = 1, isFlipped = false, gameMode = 'pvc', isGameOver = false, enPassantTarget = null, pendingPromotion = null;
let isOnlineGame = false, myOnlineColor = null;
let timeWhite = 600, timeBlack = 600, timerInterval = null;

const initialBoard = [
    'r','n','b','q','k','b','n','r', 'p','p','p','p','p','p','p','p',
    null,null,null,null,null,null,null,null, null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null, null,null,null,null,null,null,null,null,
    'P','P','P','P','P','P','P','P', 'R','N','B','Q','K','B','N','R'
];
const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

function initBoard() {
    board = [...initialBoard]; turn = 'w'; selectedSquare = null; legalMovesForSelected = []; history = []; moveNumber = 1; enPassantTarget = null; isGameOver = false;
    timeWhite = 600; timeBlack = 600;
    document.getElementById('move-list').innerHTML = ''; 
    startClock(); renderBoard();
}

function startClock() {
    if (timerInterval) clearInterval(timerInterval);
    updateClockUI();
    timerInterval = setInterval(() => {
        if (isGameOver) return;
        if (turn === 'w') timeWhite--; else timeBlack--;
        if (timeWhite <= 0 || timeBlack <= 0) { isGameOver = true; clearInterval(timerInterval); showToast("Tempo esgotado!"); }
        updateClockUI();
    }, 1000);
}

function updateClockUI() {
    const format = (t) => `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
    const cTop = document.getElementById('clock-top'), cBot = document.getElementById('clock-bottom');
    if (isFlipped) {
        cTop.innerText = format(timeWhite); cBot.innerText = format(timeBlack);
        cTop.classList.toggle('active', turn === 'w'); cBot.classList.toggle('active', turn === 'b');
    } else {
        cTop.innerText = format(timeBlack); cBot.innerText = format(timeWhite);
        cTop.classList.toggle('active', turn === 'b'); cBot.classList.toggle('active', turn === 'w');
    }
}

function startGame(mode) {
    gameMode = mode; switchView('play-view');
    if (timerInterval) clearInterval(timerInterval);
    
    if (mode === 'online') {
        isOnlineGame = true;
        document.getElementById('opp-name').innerText = "À espera...";
        socket.emit('join_game');
        socket.on('waiting', () => { document.getElementById('opp-name').innerText = "À espera..."; });
        socket.on('game_start', (data) => {
            myOnlineColor = data.color; roomId = data.room;
            document.getElementById('opp-name').innerText = "Oponente";
            if (myOnlineColor === 'black') isFlipped = true;
            initBoard();
        });
        socket.on('move', (move) => {
            board[move.to] = move.piece; board[move.from] = null; turn = turn === 'w' ? 'b' : 'w';
            renderBoard(); checkGameState(); updateClockUI();
        });
    } else {
        isOnlineGame = false;
        document.getElementById('opp-name').innerText = "Computador";
        isFlipped = false; initBoard();
    }
}

function getPseudoMoves(pos, piece, cb, ep) {
    let moves = []; const row = Math.floor(pos / 8), col = pos % 8, isW = piece === piece.toUpperCase();
    const add = (r, c) => { if (r >= 0 && r < 8 && c >= 0 && c < 8) { const tPos = r * 8 + c, tPiece = cb[tPos]; if (!tPiece || (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase())) moves.push({ from: pos, to: tPos, piece, captured: tPiece }); } };
    const p = piece.toLowerCase();
    if (p === 'p') {
        const dir = isW ? -1 : 1, start = isW ? 6 : 1;
        if (row + dir >= 0 && row + dir < 8 && !cb[(row + dir) * 8 + col]) {
            moves.push({ from: pos, to: (row + dir) * 8 + col, piece });
            if (row === start && !cb[(row + 2 * dir) * 8 + col]) moves.push({ from: pos, to: (row + 2 * dir) * 8 + col, piece });
        }
        for (const dc of [-1, 1]) {
            if (col + dc >= 0 && col + dc < 8) {
                const tPos = (row + dir) * 8 + (col + dc);
                if (row + dir >= 0 && row + dir < 8) {
                    const tPiece = cb[tPos];
                    if (tPiece && (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase())) moves.push({ from: pos, to: tPos, piece, captured: tPiece });
                    if (tPos === ep) moves.push({ from: pos, to: tPos, piece, captured: isW ? 'p' : 'P', isEnPassant: true });
                }
            }
        }
    } else if (p === 'n') { [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => add(row + dr, col + dc)); }
    else if (p === 'b' || p === 'r' || p === 'q') {
        const dirs = [];
        if (p === 'b' || p === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        if (p === 'r' || p === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        for (let [dr, dc] of dirs) {
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const tPos = r * 8 + c, tPiece = cb[tPos];
                if (!tPiece) moves.push({ from: pos, to: tPos, piece });
                else { if (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase()) moves.push({ from: pos, to: tPos, piece, captured: tPiece }); break; }
                r += dr; c += dc;
            }
        }
    } else if (p === 'k') { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr !== 0 || dc !== 0) add(row + dr, col + dc); }
    return moves;
}

function getLegalMoves(pos, piece, cb, ep) {
    return getPseudoMoves(pos, piece, cb, ep).filter(m => {
        const tb = [...cb]; tb[m.to] = piece; tb[m.from] = null;
        if (m.isEnPassant) tb[piece === piece.toUpperCase() ? m.to + 8 : m.to - 8] = null;
        return !isCheck(piece === piece.toUpperCase() ? 'w' : 'b', tb);
    });
}

function isCheck(color, cb) {
    const k = color === 'w' ? 'K' : 'k', pos = cb.indexOf(k);
    if (pos === -1) return false;
    const e = color === 'w' ? 'b' : 'w';
    for (let i = 0; i < 64; i++) {
        const p = cb[i];
        if (p && (e === 'w' ? p === p.toUpperCase() : p === p.toLowerCase())) { if (getPseudoMoves(i, p, cb, null).some(m => m.to === pos)) return true; }
    }
    return false;
}

function checkGameState() {
    let hasMoves = false;
    for (let i = 0; i < 64; i++) {
        const p = board[i];
        if (p && (turn === 'w' ? p === p.toUpperCase() : p === p.toLowerCase())) { if (getLegalMoves(i, p, board, enPassantTarget).length > 0) { hasMoves = true; break; } }
    }
    if (!hasMoves) {
        isGameOver = true; clearInterval(timerInterval);
        if (isCheck(turn, board)) showToast(`Xeque-Mate!`);
        else showToast("Empate (Afogamento)");
    }
}

function renderBoard() {
    boardEl.innerHTML = '';
    const inCheck = !isGameOver && isCheck(turn, board);
    const kPos = board.indexOf(turn === 'w' ? 'K' : 'k');
    for (let i = 0; i < 64; i++) {
        const act = isFlipped ? (63 - i) : i, r = Math.floor(act / 8), c = act % 8;
        const sq = document.createElement('div');
        sq.className = `sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        sq.setAttribute('data-file', String.fromCharCode(97 + c));
        sq.setAttribute('data-rank', 8 - r);
        if (selectedSquare === act) sq.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
        if (history.length > 0) { const last = history[history.length-1]; if (last && (last.from === act || last.to === act)) sq.classList.add('last-move'); }
        const move = legalMovesForSelected.find(m => m.to === act);
        if (move) sq.classList.add(move.captured ? 'hl-cap' : 'hl-dot');
        if (inCheck && act === kPos) sq.classList.add('chk');
        const p = board[act];
        if (p) sq.innerHTML = `<span class="piece">${getPieceChar(p)}</span>`; 
        sq.onclick = () => handleSquareClick(act);
        boardEl.appendChild(sq);
    }
}

function getPieceChar(p) {
    const style = localStorage.getItem('pieceStyle') || 'classic';
    const THEMES = {
        classic: { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        modern: { 'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        letters: { 'K': 'K', 'Q': 'Q', 'R': 'R', 'B': 'B', 'N': 'N', 'P': 'P', 'k': 'k', 'q': 'q', 'r': 'r', 'b': 'b', 'n': 'n', 'p': 'p' }
    };
    return THEMES[style][p] || p;
}

function handleSquareClick(idx) {
    if (isGameOver || (isOnlineGame && turn !== myOnlineColor) || (gameMode === 'pvc' && turn === 'b')) return;
    const clicked = board[idx];
    if (selectedSquare !== null) { const move = legalMovesForSelected.find(m => m.to === idx); if (move) { executeMove(move); return; } }
    if (clicked) {
        const isW = clicked === clicked.toUpperCase();
        if ((turn === 'w' && isW) || (turn === 'b' && !isW)) { selectedSquare = idx; legalMovesForSelected = getLegalMoves(idx, clicked, board, enPassantTarget); } else { selectedSquare = null; legalMovesForSelected = []; }
    } else { selectedSquare = null; legalMovesForSelected = []; }
    renderBoard();
}

function executeMove(move) {
    const isPawn = move.piece.toLowerCase() === 'p';
    const isProm = (move.piece === 'P' && Math.floor(move.to / 8) === 0) || (move.piece === 'p' && Math.floor(move.to / 8) === 7);
    if (isPawn && isProm) { pendingPromotion = move; openModal('promo-modal'); return; }
    finalizeMove(move);
}

function selectPromotion(type) {
    closeModal('promo-modal');
    if (pendingPromotion) { pendingPromotion.piece = pendingPromotion.piece === 'P' ? type.toUpperCase() : type.toLowerCase(); finalizeMove(pendingPromotion); pendingPromotion = null; }
}

function finalizeMove(move) {
    history.push({ from: move.from, to: move.to, board: [...board] });
    board[move.to] = move.piece; board[move.from] = null;
    if (move.isEnPassant) board[move.piece === 'P' ? move.to + 8 : move.to - 8] = null;
    enPassantTarget = null;
    if (move.piece.toLowerCase() === 'p' && Math.abs(move.to - move.from) === 16) enPassantTarget = (move.to + move.from) / 2;

    const note = `${move.piece.toUpperCase()}${String.fromCharCode(97 + (move.from % 8))}${8 - Math.floor(move.from / 8)}-${String.fromCharCode(97 + (move.to % 8))}${8 - Math.floor(move.to / 8)}`;
    if (turn === 'b') { 
        document.getElementById('move-list').innerHTML += `<li><span class="num">${moveNumber}.</span><span class="move">${note}</span></li>`; moveNumber++; 
    } else {
        const last = document.getElementById('move-list').lastElementChild;
        if (last) last.innerHTML += ` <span class="move">${note}</span>`;
        else { document.getElementById('move-list').innerHTML += `<li><span class="num">${moveNumber}.</span><span class="move">...</span><span class="move">${note}</span></li>`; }
    }

    turn = turn === 'w' ? 'b' : 'w'; selectedSquare = null; legalMovesForSelected = [];
    renderBoard(); checkGameState(); updateClockUI();

    if (isOnlineGame && roomId) socket.emit('move', { room: roomId, move: move });
    if (gameMode === 'pvc' && turn === 'b' && !isGameOver) setTimeout(makeAIMove, 500);
}

function makeAIMove() {
    if (isGameOver) return;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 64; i++) {
        const p = board[i];
        if (p && p === p.toLowerCase()) {
            const moves = getLegalMoves(i, p, board, enPassantTarget);
            for (let m of moves) {
                const tb = [...board]; tb[m.to] = m.piece; tb[m.from] = null;
                if (m.isEnPassant) tb[m.to - 8] = null;
                let sc = evalBoard(tb);
                if (isCheck('b', tb)) sc -= 50;
                sc += Math.random() * 10;
                if (sc > bestScore) { bestScore = sc; best = m; }
            }
        }
    }
    if (best) executeMove(best);
}

function evalBoard(cb) {
    let sc = 0;
    for (let p of cb) { if (p) { const v = pieceValues[p.toLowerCase()]; if (p === p.toLowerCase()) sc += v; else sc -= v; } }
    return sc;
}

function askNewGame() { location.reload(); }
function askResign() { if(isGameOver) return; if(confirm("Desistir?")) { isGameOver = true; showToast("Desististe"); } }

window.addEventListener('DOMContentLoaded', () => {
    initBoard();
    updateProfileUI();
    // Aplica o estilo Chess.com (tema clássico)
    const boards = { classic: { light: '#ebecd0', dark: '#739552' } };
    document.documentElement.style.setProperty('--light-sq', boards.classic.light);
    document.documentElement.style.setProperty('--dark-sq', boards.classic.dark);
});
