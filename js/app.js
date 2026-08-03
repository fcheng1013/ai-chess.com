// Neon glow theme: the cyan side uses Unicode's solid glyph set (filled), the pink side
// uses the hollow outline set — this is a font-level property of the codepoints, not CSS.
const PIECE_GLYPHS = {
  w: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
  b: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
};

let game = Chess.newGame();
let mode = "ai"; // "ai" | "local"
let humanColor = Chess.WHITE;
let aiDepth = 3;
let selected = null; // {row, col}
let legalTargets = []; // moves from selected square
let lastMove = null; // {from, to}
let pendingPromotion = null; // {from, to, color}
let gameOver = false;
let aiThinking = false;

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const capturedTopEl = document.getElementById("captured-top");
const capturedBottomEl = document.getElementById("captured-bottom");
const promoDialog = document.getElementById("promo-dialog");
const promoButtons = document.getElementById("promo-buttons");
const modeSelect = document.getElementById("mode-select");
const colorSelect = document.getElementById("color-select");
const difficultySelect = document.getElementById("difficulty-select");
const colorRow = document.getElementById("color-row");
const difficultyRow = document.getElementById("difficulty-row");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");

function orientation() {
  // Which color's back rank renders at the bottom of the board.
  return mode === "ai" && humanColor === Chess.BLACK ? Chess.BLACK : Chess.WHITE;
}

function boardCoordsInRenderOrder() {
  const flip = orientation() === Chess.BLACK;
  const rows = flip ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const cols = flip ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  return { rows, cols };
}

function isHumanTurn() {
  if (gameOver) return false;
  if (mode === "local") return true;
  return game.turn === humanColor;
}

function squareKey(r, c) {
  return `${r},${c}`;
}

function render() {
  boardEl.innerHTML = "";
  const { rows, cols } = boardCoordsInRenderOrder();
  const kingInCheck = Chess.isInCheck(game, game.turn) ? Chess.findKing(game.board, game.turn) : null;
  const targetKeys = new Set(legalTargets.map((m) => squareKey(m.to.row, m.to.col)));

  for (const r of rows) {
    for (const c of cols) {
      const square = document.createElement("div");
      const isLight = (r + c) % 2 === 0;
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.dataset.row = r;
      square.dataset.col = c;

      if (selected && selected.row === r && selected.col === c) square.classList.add("selected");
      if (lastMove && ((lastMove.from.row === r && lastMove.from.col === c) || (lastMove.to.row === r && lastMove.to.col === c))) {
        square.classList.add("last-move");
      }
      if (kingInCheck && kingInCheck.row === r && kingInCheck.col === c) square.classList.add("in-check");

      const piece = game.board[r][c];
      if (piece) {
        const glyph = document.createElement("span");
        glyph.className = `piece ${piece.color === Chess.WHITE ? "piece-white" : "piece-black"}`;
        glyph.textContent = PIECE_GLYPHS[piece.color][piece.type];
        square.appendChild(glyph);
      }

      if (targetKeys.has(squareKey(r, c))) {
        const dot = document.createElement("span");
        dot.className = piece ? "capture-hint" : "move-hint";
        square.appendChild(dot);
      }

      square.addEventListener("click", () => onSquareClick(r, c));
      boardEl.appendChild(square);
    }
  }

  renderCaptured();
  renderHistory();
  renderStatus();
}

function renderCaptured() {
  const captured = { w: [], b: [] };
  for (const entry of game.history) {
    if (entry.capturedPiece) captured[entry.capturedPiece.color].push(entry.capturedPiece.type);
  }
  const order = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
  const fmt = (color) =>
    captured[color]
      .sort((a, b) => order[a] - order[b])
      .map((t) => PIECE_GLYPHS[color][t])
      .join(" ");

  const bottomColor = orientation();
  const topColor = Chess.otherColor(bottomColor);
  capturedTopEl.textContent = fmt(topColor === Chess.WHITE ? Chess.BLACK : Chess.WHITE);
  capturedBottomEl.textContent = fmt(bottomColor === Chess.WHITE ? Chess.BLACK : Chess.WHITE);
}

function renderHistory() {
  historyEl.innerHTML = "";
  const moves = game.history;
  for (let i = 0; i < moves.length; i += 2) {
    const li = document.createElement("li");
    const num = i / 2 + 1;
    const white = moves[i]?.san ?? "";
    const black = moves[i + 1]?.san ?? "";
    li.innerHTML = `<span class="num">${num}.</span> <span>${white}</span> <span>${black}</span>`;
    historyEl.appendChild(li);
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderStatus() {
  if (aiThinking) {
    statusEl.textContent = "AI is thinking…";
    statusEl.className = "status thinking";
    return;
  }
  const status = Chess.getStatus(game);
  const turnName = game.turn === Chess.WHITE ? "White" : "Black";
  if (status.status === "checkmate") {
    const winner = status.winner === Chess.WHITE ? "White" : "Black";
    statusEl.textContent = `Checkmate — ${winner} wins!`;
    statusEl.className = "status over";
    gameOver = true;
  } else if (status.status === "stalemate") {
    statusEl.textContent = "Stalemate — draw.";
    statusEl.className = "status over";
    gameOver = true;
  } else if (status.status === "check") {
    statusEl.textContent = `${turnName} is in check.`;
    statusEl.className = "status check";
  } else {
    statusEl.textContent = `${turnName} to move.`;
    statusEl.className = "status";
  }
}

function onSquareClick(row, col) {
  if (aiThinking || gameOver || pendingPromotion) return;
  if (!isHumanTurn()) return;

  const piece = game.board[row][col];

  if (selected) {
    const match = legalTargets.filter((m) => m.to.row === row && m.to.col === col);
    if (match.length > 0) {
      if (match.length > 1) {
        pendingPromotion = { moves: match, color: match[0].color };
        showPromotionDialog();
        return;
      }
      commitMove(match[0]);
      return;
    }
    // Clicking another own piece re-selects instead of moving.
    if (piece && piece.color === game.turn) {
      selectSquare(row, col);
    } else {
      selected = null;
      legalTargets = [];
      render();
    }
    return;
  }

  if (piece && piece.color === game.turn) {
    selectSquare(row, col);
  }
}

function selectSquare(row, col) {
  selected = { row, col };
  legalTargets = Chess.legalMovesForSquare(game, row, col);
  render();
}

function showPromotionDialog() {
  const color = pendingPromotion.color;
  promoButtons.innerHTML = "";
  for (const type of ["Q", "R", "B", "N"]) {
    const btn = document.createElement("button");
    btn.textContent = PIECE_GLYPHS[color][type];
    btn.addEventListener("click", () => {
      const move = pendingPromotion.moves.find((m) => m.promotion === type);
      pendingPromotion = null;
      promoDialog.classList.add("hidden");
      commitMove(move);
    });
    promoButtons.appendChild(btn);
  }
  promoDialog.classList.remove("hidden");
}

function commitMove(move) {
  game = Chess.applyMove(game, move);
  lastMove = { from: move.from, to: move.to };
  selected = null;
  legalTargets = [];
  render();

  const status = Chess.getStatus(game);
  if (status.status === "checkmate" || status.status === "stalemate") {
    gameOver = true;
    render();
    return;
  }

  if (mode === "ai" && game.turn !== humanColor) {
    aiThinking = true;
    render();
    setTimeout(runAiMove, 50);
  }
}

function runAiMove() {
  const move = ChessAI.chooseMove(game, aiDepth);
  aiThinking = false;
  if (!move) {
    render();
    return;
  }
  game = Chess.applyMove(game, move);
  lastMove = { from: move.from, to: move.to };
  render();
}

function startNewGame() {
  game = Chess.newGame();
  selected = null;
  legalTargets = [];
  lastMove = null;
  pendingPromotion = null;
  gameOver = false;
  aiThinking = false;
  promoDialog.classList.add("hidden");
  render();

  if (mode === "ai" && humanColor === Chess.BLACK) {
    aiThinking = true;
    render();
    setTimeout(runAiMove, 50);
  }
}

function undo() {
  if (aiThinking) return;
  // Undo one full round (human + AI) in AI mode so it stays the human's turn; one ply in local mode.
  const plies = mode === "ai" ? 2 : 1;
  for (let i = 0; i < plies && game.history.length > 0; i++) {
    game = replayWithoutLastMove(game);
  }
  gameOver = false;
  selected = null;
  legalTargets = [];
  lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  if (lastMove) lastMove = { from: lastMove.from, to: lastMove.to };
  render();
}

function replayWithoutLastMove(state) {
  const moves = state.history.slice(0, -1).map((h) => h.move);
  let replay = Chess.newGame();
  for (const move of moves) {
    // Re-derive the exact legal move object at this position (board coordinates are stable).
    const candidates = Chess.legalMovesForSquare(replay, move.from.row, move.from.col);
    const found = candidates.find(
      (m) => m.to.row === move.to.row && m.to.col === move.to.col && m.promotion === move.promotion
    );
    replay = Chess.applyMove(replay, found || move);
  }
  return replay;
}

modeSelect.addEventListener("change", () => {
  mode = modeSelect.value;
  colorRow.classList.toggle("hidden", mode !== "ai");
  difficultyRow.classList.toggle("hidden", mode !== "ai");
  startNewGame();
});

colorSelect.addEventListener("change", () => {
  humanColor = colorSelect.value === "white" ? Chess.WHITE : Chess.BLACK;
  startNewGame();
});

difficultySelect.addEventListener("change", () => {
  aiDepth = parseInt(difficultySelect.value, 10);
});

newGameBtn.addEventListener("click", startNewGame);
undoBtn.addEventListener("click", undo);

startNewGame();
