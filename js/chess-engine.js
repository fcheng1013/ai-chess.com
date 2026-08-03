/* Chess rules engine: board representation, legal move generation, check/mate detection.
 * Board layout: board[row][col], row 0 = rank 8 (black back rank), row 7 = rank 1 (white back rank).
 * col 0 = file a, col 7 = file h. White moves toward row 0; black moves toward row 7.
 */
const Chess = (() => {
  const WHITE = "w";
  const BLACK = "b";

  function otherColor(color) {
    return color === WHITE ? BLACK : WHITE;
  }

  function initialBoard() {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: back[c], color: BLACK };
      board[1][c] = { type: "P", color: BLACK };
      board[6][c] = { type: "P", color: WHITE };
      board[7][c] = { type: back[c], color: WHITE };
    }
    return board;
  }

  function newGame() {
    return {
      board: initialBoard(),
      turn: WHITE,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null, // {row, col} square that can be captured onto
      halfmoveClock: 0,
      fullmoveNumber: 1,
      history: [], // list of {move, san, boardBefore metadata for undo}
    };
  }

  function cloneState(state) {
    return {
      board: state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
      turn: state.turn,
      castling: { ...state.castling },
      enPassant: state.enPassant ? { ...state.enPassant } : null,
      halfmoveClock: state.halfmoveClock,
      fullmoveNumber: state.fullmoveNumber,
      history: state.history, // shared reference is fine; we replace the array on push
    };
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function fileOf(c) {
    return "abcdefgh"[c];
  }
  function rankOf(r) {
    return 8 - r;
  }
  function squareName(r, c) {
    return `${fileOf(c)}${rankOf(r)}`;
  }

  const KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  const KING_OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell && cell.type === "K" && cell.color === color) return { row: r, col: c };
      }
    }
    return null;
  }

  // Ray-cast from the target square outward to see if `byColor` attacks it.
  function isSquareAttacked(board, targetRow, targetCol, byColor) {
    // Pawn attacks: a pawn attacks diagonally forward from its own perspective.
    const pawnRowOffset = byColor === WHITE ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = targetRow + pawnRowOffset;
      const pc = targetCol + dc;
      if (inBounds(pr, pc)) {
        const cell = board[pr][pc];
        if (cell && cell.type === "P" && cell.color === byColor) return true;
      }
    }

    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = targetRow + dr;
      const c = targetCol + dc;
      if (inBounds(r, c)) {
        const cell = board[r][c];
        if (cell && cell.type === "N" && cell.color === byColor) return true;
      }
    }

    for (const [dr, dc] of KING_OFFSETS) {
      const r = targetRow + dr;
      const c = targetCol + dc;
      if (inBounds(r, c)) {
        const cell = board[r][c];
        if (cell && cell.type === "K" && cell.color === byColor) return true;
      }
    }

    for (const [dr, dc] of BISHOP_DIRS) {
      let r = targetRow + dr;
      let c = targetCol + dc;
      while (inBounds(r, c)) {
        const cell = board[r][c];
        if (cell) {
          if (cell.color === byColor && (cell.type === "B" || cell.type === "Q")) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (const [dr, dc] of ROOK_DIRS) {
      let r = targetRow + dr;
      let c = targetCol + dc;
      while (inBounds(r, c)) {
        const cell = board[r][c];
        if (cell) {
          if (cell.color === byColor && (cell.type === "R" || cell.type === "Q")) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    return false;
  }

  function isInCheck(state, color) {
    const king = findKing(state.board, color);
    if (!king) return false;
    return isSquareAttacked(state.board, king.row, king.col, otherColor(color));
  }

  // Pseudo-legal moves for one piece (doesn't check own-king safety yet).
  function pseudoMovesForSquare(state, row, col) {
    const board = state.board;
    const piece = board[row][col];
    if (!piece) return [];
    const moves = [];
    const color = piece.color;
    const enemy = otherColor(color);

    const addMove = (toRow, toCol, extra = {}) => {
      moves.push({ from: { row, col }, to: { row: toRow, col: toCol }, piece: piece.type, color, ...extra });
    };

    if (piece.type === "P") {
      const dir = color === WHITE ? -1 : 1;
      const startRow = color === WHITE ? 6 : 1;
      const promoRow = color === WHITE ? 0 : 7;

      const oneRow = row + dir;
      if (inBounds(oneRow, col) && !board[oneRow][col]) {
        if (oneRow === promoRow) {
          for (const promo of ["Q", "R", "B", "N"]) addMove(oneRow, col, { promotion: promo });
        } else {
          addMove(oneRow, col, {});
        }
        const twoRow = row + dir * 2;
        if (row === startRow && !board[twoRow][col]) {
          addMove(twoRow, col, { doubleStep: true });
        }
      }
      for (const dc of [-1, 1]) {
        const tr = row + dir;
        const tc = col + dc;
        if (!inBounds(tr, tc)) continue;
        const target = board[tr][tc];
        if (target && target.color === enemy) {
          if (tr === promoRow) {
            for (const promo of ["Q", "R", "B", "N"]) addMove(tr, tc, { promotion: promo, capture: true });
          } else {
            addMove(tr, tc, { capture: true });
          }
        } else if (state.enPassant && state.enPassant.row === tr && state.enPassant.col === tc) {
          addMove(tr, tc, { enPassant: true, capture: true });
        }
      }
    } else if (piece.type === "N") {
      for (const [dr, dc] of KNIGHT_OFFSETS) {
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const target = board[r][c];
        if (!target) addMove(r, c, {});
        else if (target.color === enemy) addMove(r, c, { capture: true });
      }
    } else if (piece.type === "K") {
      for (const [dr, dc] of KING_OFFSETS) {
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const target = board[r][c];
        if (!target) addMove(r, c, {});
        else if (target.color === enemy) addMove(r, c, { capture: true });
      }
      // Castling
      const rights = state.castling;
      const rank = color === WHITE ? 7 : 0;
      if (row === rank && col === 4 && !isInCheck(state, color)) {
        const canCastle = (side) => {
          const kRight = color === WHITE ? (side === "K" ? rights.wK : rights.wQ) : (side === "K" ? rights.bK : rights.bQ);
          if (!kRight) return false;
          if (side === "K") {
            if (board[rank][5] || board[rank][6]) return false;
            if (isSquareAttacked(board, rank, 5, enemy) || isSquareAttacked(board, rank, 6, enemy)) return false;
            const rook = board[rank][7];
            return rook && rook.type === "R" && rook.color === color;
          } else {
            if (board[rank][3] || board[rank][2] || board[rank][1]) return false;
            if (isSquareAttacked(board, rank, 3, enemy) || isSquareAttacked(board, rank, 2, enemy)) return false;
            const rook = board[rank][0];
            return rook && rook.type === "R" && rook.color === color;
          }
        };
        if (canCastle("K")) addMove(rank, 6, { castle: "K" });
        if (canCastle("Q")) addMove(rank, 2, { castle: "Q" });
      }
    } else {
      const dirs = piece.type === "B" ? BISHOP_DIRS : piece.type === "R" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
      for (const [dr, dc] of dirs) {
        let r = row + dr;
        let c = col + dc;
        while (inBounds(r, c)) {
          const target = board[r][c];
          if (!target) {
            addMove(r, c, {});
          } else {
            if (target.color === enemy) addMove(r, c, { capture: true });
            break;
          }
          r += dr;
          c += dc;
        }
      }
    }

    return moves;
  }

  function applyMove(state, move) {
    const next = cloneState(state);
    const board = next.board;
    const piece = board[move.from.row][move.from.col];
    const color = piece.color;

    let capturedPiece = board[move.to.row][move.to.col];

    if (move.enPassant) {
      const capRow = color === WHITE ? move.to.row + 1 : move.to.row - 1;
      capturedPiece = board[capRow][move.to.col];
      board[capRow][move.to.col] = null;
    }

    board[move.from.row][move.from.col] = null;
    board[move.to.row][move.to.col] = move.promotion ? { type: move.promotion, color } : piece;

    if (move.castle) {
      const rank = move.from.row;
      if (move.castle === "K") {
        board[rank][5] = board[rank][7];
        board[rank][7] = null;
      } else {
        board[rank][3] = board[rank][0];
        board[rank][0] = null;
      }
    }

    // Update castling rights
    if (piece.type === "K") {
      if (color === WHITE) { next.castling.wK = false; next.castling.wQ = false; }
      else { next.castling.bK = false; next.castling.bQ = false; }
    }
    const clearRookRight = (r, c) => {
      if (r === 7 && c === 0) next.castling.wQ = false;
      else if (r === 7 && c === 7) next.castling.wK = false;
      else if (r === 0 && c === 0) next.castling.bQ = false;
      else if (r === 0 && c === 7) next.castling.bK = false;
    };
    if (piece.type === "R") clearRookRight(move.from.row, move.from.col);
    if (capturedPiece && capturedPiece.type === "R") clearRookRight(move.to.row, move.to.col);

    // En passant target for next move
    next.enPassant = move.doubleStep
      ? { row: (move.from.row + move.to.row) / 2, col: move.from.col }
      : null;

    next.halfmoveClock = move.capture || piece.type === "P" ? 0 : state.halfmoveClock + 1;
    if (color === BLACK) next.fullmoveNumber += 1;
    next.turn = otherColor(color);

    const san = toSAN(state, move, capturedPiece);
    next.history = [...state.history, { move, san, capturedPiece }];

    return next;
  }

  function legalMovesForSquare(state, row, col) {
    const piece = state.board[row][col];
    if (!piece || piece.color !== state.turn) return [];
    const pseudo = pseudoMovesForSquare(state, row, col);
    return pseudo.filter((m) => {
      const next = applyMove(state, m);
      return !isInCheck(next, piece.color);
    });
  }

  function allLegalMoves(state, color = state.turn) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (piece && piece.color === color) {
          const pseudo = pseudoMovesForSquare(state, r, c);
          for (const m of pseudo) {
            const next = applyMove(state, m);
            if (!isInCheck(next, color)) moves.push(m);
          }
        }
      }
    }
    return moves;
  }

  function getStatus(state) {
    const color = state.turn;
    const inCheck = isInCheck(state, color);
    const moves = allLegalMoves(state, color);
    if (moves.length === 0) {
      return inCheck ? { status: "checkmate", winner: otherColor(color) } : { status: "stalemate" };
    }
    return { status: inCheck ? "check" : "ongoing" };
  }

  function toSAN(stateBefore, move, capturedPiece) {
    if (move.castle === "K") return "O-O";
    if (move.castle === "Q") return "O-O-O";
    const pieceLetter = move.piece === "P" ? "" : move.piece;
    const capture = move.capture ? "x" : "";
    const fromFile = move.piece === "P" && move.capture ? fileOf(move.from.col) : "";
    const dest = squareName(move.to.row, move.to.col);
    const promo = move.promotion ? `=${move.promotion}` : "";
    return `${pieceLetter}${fromFile}${capture}${dest}${promo}`;
  }

  return {
    WHITE,
    BLACK,
    otherColor,
    newGame,
    cloneState,
    findKing,
    isSquareAttacked,
    isInCheck,
    pseudoMovesForSquare,
    applyMove,
    legalMovesForSquare,
    allLegalMoves,
    getStatus,
    squareName,
    fileOf,
    rankOf,
  };
})();
