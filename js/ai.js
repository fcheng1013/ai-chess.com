/* Minimax + alpha-beta chess AI. Evaluates from White's perspective (positive = good for White). */
const ChessAI = (() => {
  const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

  // Piece-square tables (from White's viewpoint, row 0 = rank 8). Encourage sane development.
  const PAWN_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ];
  const BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ];
  const ROOK_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ];
  const QUEEN_TABLE = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ];
  const KING_TABLE = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ];
  const TABLES = { P: PAWN_TABLE, N: KNIGHT_TABLE, B: BISHOP_TABLE, R: ROOK_TABLE, Q: QUEEN_TABLE, K: KING_TABLE };

  function evaluate(state) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = state.board[r][c];
        if (!cell) continue;
        const base = PIECE_VALUES[cell.type];
        const tableRow = cell.color === Chess.WHITE ? r : 7 - r;
        const positional = TABLES[cell.type][tableRow][c];
        const value = base + positional;
        score += cell.color === Chess.WHITE ? value : -value;
      }
    }
    return score;
  }

  // Cheap move ordering: try captures first so alpha-beta prunes more.
  function orderMoves(moves) {
    return moves.slice().sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));
  }

  function negamax(state, depth, alpha, beta, colorSign) {
    const status = Chess.getStatus(state);
    if (status.status === "checkmate") return -100000 - depth; // prefer faster mates
    if (status.status === "stalemate") return 0;
    if (depth === 0) return colorSign * evaluate(state);

    let best = -Infinity;
    const moves = orderMoves(Chess.allLegalMoves(state, state.turn));
    for (const move of moves) {
      const next = Chess.applyMove(state, move);
      const score = -negamax(next, depth - 1, -beta, -alpha, -colorSign);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove(state, depth) {
    const moves = orderMoves(Chess.allLegalMoves(state, state.turn));
    if (moves.length === 0) return null;
    const colorSign = state.turn === Chess.WHITE ? 1 : -1;

    let bestMove = moves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of moves) {
      const next = Chess.applyMove(state, move);
      const score = -negamax(next, depth - 1, -beta, -alpha, -colorSign);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (bestScore > alpha) alpha = bestScore;
    }
    return bestMove;
  }

  return { chooseMove, evaluate };
})();
