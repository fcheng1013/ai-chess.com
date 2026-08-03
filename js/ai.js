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

  // Centipawn-loss thresholds for judging a played move against the best move found
  // at the same shallow search depth. This is a lightweight heuristic for commentary,
  // not an authoritative analysis (a deeper search could disagree).
  const JUDGMENT_THRESHOLDS = [
    { max: 15, label: "best" },
    { max: 50, label: "good" },
    { max: 120, label: "inaccuracy" },
    { max: 300, label: "mistake" },
  ];

  function classifyLoss(lossCentipawns) {
    for (const t of JUDGMENT_THRESHOLDS) {
      if (lossCentipawns <= t.max) return t.label;
    }
    return "blunder";
  }

  function analyzeMove(stateBefore, playedMove, depth) {
    const moves = orderMoves(Chess.allLegalMoves(stateBefore, stateBefore.turn));
    if (moves.length <= 1) {
      return { bestScore: 0, playedScore: 0, lossCentipawns: 0, label: "forced" };
    }

    const colorSign = stateBefore.turn === Chess.WHITE ? 1 : -1;
    let bestScore = -Infinity;
    let playedScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of moves) {
      const next = Chess.applyMove(stateBefore, move);
      const score = -negamax(next, depth - 1, -beta, -alpha, -colorSign);
      if (score > bestScore) bestScore = score;
      if (score > alpha) alpha = score;
      const isPlayed =
        move.from.row === playedMove.from.row &&
        move.from.col === playedMove.from.col &&
        move.to.row === playedMove.to.row &&
        move.to.col === playedMove.to.col &&
        move.promotion === playedMove.promotion;
      if (isPlayed) playedScore = score;
    }

    const lossCentipawns = Math.max(0, bestScore - playedScore);
    return { bestScore, playedScore, lossCentipawns, label: classifyLoss(lossCentipawns) };
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

  return { chooseMove, evaluate, analyzeMove };
})();
