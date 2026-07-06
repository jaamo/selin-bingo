/*
 * Selin Bingo — game logic
 * Static, no build step, no dependencies. Works from file:// too.
 */

// ---- Configuration -------------------------------------------------
const GRID_SIZE  = 4;      // 3 = 3x3 board, 4 = 4x4 board, 5 = 5x5 board
const FREE_SPACE = true;   // free center cell (only for odd sizes)
const STORAGE_KEY = "selin-bingo-v1";
// --------------------------------------------------------------------

const boardEl    = document.getElementById("board");
const bannerEl   = document.getElementById("banner");
const progressEl = document.getElementById("progress");
const resetBtn   = document.getElementById("reset");
const dayNoticeEl = document.getElementById("dayNotice");

// A free space works on any grid size. For even grids there's no true
// single center, so we use a central-ish cell.
const hasFreeCenter = FREE_SPACE;
const centerIndex   = hasFreeCenter
  ? Math.floor(GRID_SIZE / 2) * GRID_SIZE + Math.floor(GRID_SIZE / 2)
  : -1;

let state = null;              // { board: string[], checked: boolean[] }
let gameDay = null;            // local calendar day the board was created (see todayKey)
let discardedStaleGame = false; // true when load() threw away yesterday's board

// ---- Persistence ---------------------------------------------------
// Signature so the saved game resets if the sayings pool changes.
function sayingsSignature() {
  return `${SAYINGS.length}:${GRID_SIZE}:${hasFreeCenter}`;
}

// Local calendar day key, e.g. "2026-7-6". Used to auto-reset the game
// each day: a board created on a different day is discarded.
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sig: sayingsSignature(),
      day: gameDay,
      board: state.board,
      checked: state.checked,
    }));
  } catch (e) { /* storage unavailable — game still works this session */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.sig !== sayingsSignature()) return null;
    if (data.day !== todayKey()) {            // yesterday's game — discard it
      discardedStaleGame = true;
      return null;
    }
    if (!Array.isArray(data.board) || data.board.length !== GRID_SIZE * GRID_SIZE) return null;
    if (!Array.isArray(data.checked) || data.checked.length !== data.board.length) return null;
    gameDay = data.day;
    return { board: data.board, checked: data.checked };
  } catch (e) {
    return null;
  }
}

// ---- Board generation ----------------------------------------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame() {
  const total = GRID_SIZE * GRID_SIZE;
  const needed = hasFreeCenter ? total - 1 : total;

  const pool = shuffle(SAYINGS).slice(0, needed);
  const board = [];
  const checked = [];
  let p = 0;

  for (let i = 0; i < total; i++) {
    if (i === centerIndex) {
      board.push("VAPAA");
      checked.push(true);
    } else {
      board.push(pool[p] ?? "");
      checked.push(false);
      p++;
    }
  }

  state = { board, checked };
  gameDay = todayKey();
  save();
  render();
}

// ---- Win detection -------------------------------------------------
function winningCells() {
  const n = GRID_SIZE;
  const c = state.checked;
  const lines = [];

  for (let r = 0; r < n; r++) {
    lines.push(Array.from({ length: n }, (_, k) => r * n + k));      // rows
    lines.push(Array.from({ length: n }, (_, k) => k * n + r));      // cols
  }
  lines.push(Array.from({ length: n }, (_, k) => k * n + k));         // diag
  lines.push(Array.from({ length: n }, (_, k) => k * n + (n - 1 - k))); // anti-diag

  const winners = new Set();
  for (const line of lines) {
    if (line.every((idx) => c[idx])) line.forEach((idx) => winners.add(idx));
  }
  return winners;
}

// ---- Rendering -----------------------------------------------------
function render() {
  boardEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
  boardEl.innerHTML = "";

  const winners = winningCells();

  state.board.forEach((text, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.textContent = text;

    const isFree = i === centerIndex;
    if (isFree) cell.classList.add("free");
    if (state.checked[i]) cell.classList.add("checked");
    if (winners.has(i)) cell.classList.add("win");

    if (!isFree) {
      cell.addEventListener("click", () => toggle(i));
    }
    boardEl.appendChild(cell);
  });

  fitBoardText();

  // Progress + banner
  const marked = state.checked.filter(Boolean).length - (hasFreeCenter ? 1 : 0);
  const totalMarkable = GRID_SIZE * GRID_SIZE - (hasFreeCenter ? 1 : 0);
  progressEl.textContent = `Merkitty ${marked} / ${totalMarkable}`;

  const fullHouse = state.checked.every(Boolean);
  if (fullHouse) {
    showBanner("TÄYSI PANKKI! 🎉");
  } else if (winners.size > 0) {
    showBanner("BINGO! 🚴💨");
  } else {
    hideBanner();
  }
}

// Give each cell the largest font size that still fits its own text,
// so short sayings read big and long ones only shrink as much as needed.
const FONT_MAX = 19; // px — cap for short sayings
const FONT_MIN = 9;  // px — floor for the longest sayings

function fitCell(cell) {
  let size = FONT_MAX;
  cell.style.fontSize = size + "px";
  while (
    size > FONT_MIN &&
    (cell.scrollHeight > cell.clientHeight || cell.scrollWidth > cell.clientWidth)
  ) {
    size -= 0.5;
    cell.style.fontSize = size + "px";
  }
}

function fitBoardText() {
  for (const cell of boardEl.children) fitCell(cell);
}

// Re-fit when the viewport changes (rotation, resize).
window.addEventListener("resize", () => {
  if (state) fitBoardText();
});

// Shown once when a new calendar day cleared the previous board.
let dayNoticeTimer = null;
function showDayNotice() {
  dayNoticeEl.textContent = "Uusi päivä, uusi bingo! 🚴 Eilisen ruudukko nollattiin.";
  dayNoticeEl.hidden = false;
  if (dayNoticeTimer) clearTimeout(dayNoticeTimer);
  dayNoticeTimer = setTimeout(() => { dayNoticeEl.hidden = true; }, 8000);
}
dayNoticeEl.addEventListener("click", () => { dayNoticeEl.hidden = true; });

function showBanner(msg) {
  bannerEl.textContent = msg;
  bannerEl.hidden = false;
}
function hideBanner() {
  bannerEl.hidden = true;
}

// ---- Interaction ---------------------------------------------------
function toggle(i) {
  if (i === centerIndex) return;
  const wasWinning = winningCells().size > 0;
  state.checked[i] = !state.checked[i];
  save();
  render();

  // celebratory buzz the moment a new bingo appears
  if (!wasWinning && winningCells().size > 0 && navigator.vibrate) {
    navigator.vibrate([40, 40, 120]);
  }
}

resetBtn.addEventListener("click", () => {
  if (confirm("Aloitetaanko uusi peli? Nykyiset merkinnät nollataan.")) {
    newGame();
  }
});

// Auto-reset a board left open past midnight: when the tab becomes visible
// again on a new calendar day, start a fresh game.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state && gameDay && gameDay !== todayKey()) {
    newGame();
    showDayNotice();
  }
});

// ---- Boot ----------------------------------------------------------
(function init() {
  if (!Array.isArray(SAYINGS) || SAYINGS.length === 0) {
    boardEl.innerHTML = "<p style='padding:20px;text-align:center'>Lisää sanontoja tiedostoon <code>sayings.js</code>.</p>";
    return;
  }
  const needed = GRID_SIZE * GRID_SIZE - (hasFreeCenter ? 1 : 0);
  if (SAYINGS.length < needed) {
    boardEl.innerHTML =
      `<p style='padding:20px;text-align:center'>Tarvitaan vähintään ${needed} sanontaa (nyt ${SAYINGS.length}). ` +
      `Lisää lisää tiedostoon <code>sayings.js</code> tai pienennä ruudukkoa <code>app.js</code>:ssä.</p>`;
    return;
  }

  state = load();
  if (!state) {
    newGame();
    if (discardedStaleGame) showDayNotice();
  } else {
    render();
  }
})();
