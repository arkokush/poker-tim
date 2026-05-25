/**
 * PokerBot - Main Application Controller
 *
 * BvB defaults to step-by-step. Three playback modes:
 *   Step     - advance one bot action at a time
 *   Auto Play - bots play at a visible pace (can pause back to step mode)
 *   Fast Forward - instantly simulate 100 hands, show totals
 */

const GAMES = {
  kuhn: () => new KuhnPoker(),
  leduc: () => new LeducPoker(),
  limit: () => new LimitHoldem(),
};

const GAME_NAMES = {
  kuhn: 'Kuhn Poker',
  leduc: 'Leduc Poker',
  limit: "Limit Hold'em",
};

const MODE_LABELS = {
  pvp: 'Player vs Player',
  pvb: 'Player vs Bot',
  bvb: 'Bot vs Bot',
};

// Bot action delay (ms) — slower so the user can follow
const DELAY_BVB = 1600;
const DELAY_PVB = 800;
const DELAY_END_HAND = 2800;

// ===== Theme Toggle =====
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('pokerbot-theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (theme === 'light') {
    icon.innerHTML = '&#9728;';
    label.textContent = 'Dark';
  } else {
    icon.innerHTML = '&#9790;';
    label.textContent = 'Light';
  }
}

(function initTheme() {
  const saved = localStorage.getItem('pokerbot-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  window.addEventListener('DOMContentLoaded', () => updateThemeButton(saved));
})();


class App {
  constructor() {
    this.gameKey = null;
    this.game = null;
    this.mode = null;
    this.scores = [0, 0];
    this.handNum = 0;

    this.playerCards = null;
    this.communityCards = null;
    this.history = '';
    this.dealerButton = 0;
    this.handOver = false;
    this.timer = null;

    // Playback state for BvB
    this.autoPlaying = false;   // auto-play mode (visible, slow)
    this.pendingAction = null;  // stored callback when waiting for step

    // Pot tracking for animations
    this._prevPot = 0;
    this._prevCommits = [0, 0];
    this._lastAction = '';      // track last action for animations
    this._lastPlayer = -1;
  }

  async init(gameKey, mode) {
    this.gameKey = gameKey;
    this.game = GAMES[gameKey]();
    this.mode = mode;
    this.scores = [0, 0];
    this.handNum = 0;
    this.autoPlaying = false;
    this.pendingAction = null;

    if (mode === 'pvb' || mode === 'bvb') {
      try {
        await this.game.loadStrategy();
      } catch (e) {
        console.error('Failed to load strategy:', e);
        alert('Failed to load bot strategy. Make sure model files exist in docs/models/.');
        return;
      }
    }

    // Show playback controls for BvB
    const controls = document.getElementById('playback-controls');
    if (mode === 'bvb') {
      controls.classList.remove('hidden');
    } else {
      controls.classList.add('hidden');
    }
    document.getElementById('ff-stats').classList.add('hidden');
    this._updatePlaybackUI();

    this._setupLabels();
    this.startHand();
  }

  // =====================
  // Playback controls
  // =====================

  /** Step: execute exactly one pending bot action */
  stepOnce() {
    if (this.autoPlaying) return;
    if (this.pendingAction) {
      const fn = this.pendingAction;
      this.pendingAction = null;
      fn();
    }
  }

  /** Toggle auto-play on/off */
  toggleAutoPlay() {
    this.autoPlaying = !this.autoPlaying;
    this._updatePlaybackUI();

    if (this.autoPlaying && this.pendingAction) {
      const fn = this.pendingAction;
      this.pendingAction = null;
      fn();
    }
  }

  /** Fast Forward: simulate 100 hands instantly (no rendering) */
  fastForward() {
    // Stop any current auto-play
    this.autoPlaying = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.pendingAction = null;

    const N = 100;
    let wins0 = 0, wins1 = 0, draws = 0;
    let chips0 = 0, chips1 = 0;

    for (let i = 0; i < N; i++) {
      const result = this._simulateOneHand();
      if (result.winner === 0) { wins0++; chips0 += result.amount; }
      else if (result.winner === 1) { wins1++; chips1 += result.amount; }
      else { draws++; }
    }

    this.scores[0] += chips0;
    this.scores[1] += chips1;
    this.handNum += N;

    document.getElementById('p0-score').textContent = this.scores[0];
    document.getElementById('p1-score').textContent = this.scores[1];
    document.getElementById('hand-count').textContent = `Hand #${this.handNum}`;

    // Show stats
    const statsEl = document.getElementById('ff-stats');
    const summary = document.getElementById('ff-summary');
    statsEl.classList.remove('hidden');
    summary.innerHTML =
      `Simulated ${N} hands: ` +
      `<span class="ff-win">Bot 1 won ${wins0}</span> | ` +
      `<span class="ff-lose">Bot 2 won ${wins1}</span> | ` +
      `Draws ${draws} &mdash; ` +
      `<span class="ff-win">+${chips0}</span> / ` +
      `<span class="ff-lose">+${chips1}</span> chips`;

    this._updatePlaybackUI();

    // Start a fresh visible hand so user can see state
    this.startHand();
  }

  /** Simulate one complete hand with no rendering. Returns {winner, amount}. */
  _simulateOneHand() {
    const dealt = this.game.deal();
    const pCards = dealt.playerCards;
    const cCards = dealt.communityCards;
    let hist = '';

    while (!this.game.isTerminal(hist)) {
      const actions = this.game.getLegalActions(hist);

      if (actions.length === 1 && actions[0] === '//') {
        hist += '//';
        continue;
      }

      const player = this.game.getActingPlayer(hist);
      const card = pCards[player];
      let action;

      if (this.gameKey === 'kuhn') {
        action = this.game.getBotAction(card[0], hist);
      } else if (this.gameKey === 'leduc') {
        action = this.game.getBotAction(card[0], hist, cCards[0]);
      } else {
        action = this.game.getBotAction(card, hist, cCards);
      }

      if (action === '//') { hist += '//'; continue; }
      hist += action;
    }

    if (this.gameKey === 'kuhn') {
      return this.game.getPayoff(pCards, hist);
    }
    return this.game.getPayoff(pCards, hist, cCards);
  }

  _updatePlaybackUI() {
    const playBtn = document.getElementById('btn-play');
    const playIcon = document.getElementById('play-icon');
    const playLabel = document.getElementById('play-label');
    const stepBtn = document.getElementById('btn-step');

    if (this.autoPlaying) {
      playIcon.innerHTML = '&#9208;';
      playLabel.textContent = 'Pause';
      playBtn.classList.add('active');
      stepBtn.disabled = true;
    } else {
      playIcon.innerHTML = '&#9654;';
      playLabel.textContent = 'Auto Play';
      playBtn.classList.remove('active');
      stepBtn.disabled = false;
    }
  }

  // =====================
  // Setup & hand lifecycle
  // =====================

  _setupLabels() {
    const p0Label = this.mode === 'bvb' ? 'Bot 1' : 'Player 1';
    const p1Label = this.mode === 'pvp' ? 'Player 2' : this.mode === 'pvb' ? 'Bot' : 'Bot 2';

    document.getElementById('p0-label').textContent = p0Label;
    document.getElementById('p1-label').textContent = p1Label;
    document.getElementById('player-label').textContent = p0Label;
    document.getElementById('opponent-label').textContent = p1Label;
    document.getElementById('game-title').textContent = this.game.name;
    document.getElementById('game-mode-badge').textContent = MODE_LABELS[this.mode];
    document.getElementById('p0-score').textContent = '0';
    document.getElementById('p1-score').textContent = '0';

    const infoSection = document.getElementById('game-info');
    const infoContent = document.getElementById('game-info-content');
    infoContent.innerHTML = this.game.getGameInfo();
    infoSection.classList.remove('hidden');
  }

  startHand() {
    this.handNum++;
    this.history = '';
    this.handOver = false;
    this._prevPot = 0;
    this._prevCommits = [0, 0];
    this._lastAction = '';
    this._lastPlayer = -1;

    const dealt = this.game.deal();
    this.playerCards = dealt.playerCards;
    this.communityCards = dealt.communityCards;

    document.getElementById('hand-count').textContent = `Hand #${this.handNum}`;
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('history-log').innerHTML = '';
    document.getElementById('strategy-panel').classList.add('hidden');

    // Clear pot chips
    document.getElementById('pot-chips').innerHTML = '';

    this._renderTable();
    this._processNextAction();
  }

  nextHand() {
    this.dealerButton = 1 - this.dealerButton;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.startHand();
  }

  // =====================
  // Rendering
  // =====================

  _renderTable() {
    const showCommunity = this.gameKey === 'leduc'
      ? this.game.showCommunity(this.history)
      : (this.gameKey === 'limit' ? this.game.getVisibleCommunity(this.history) > 0 : false);

    this._renderPlayerCards();
    this._renderOpponentCards();
    this._renderCommunityCards(showCommunity);

    // Pot
    const newPot = this.game.getPotSize(this.history);
    document.getElementById('pot-amount').textContent = newPot;

    if (newPot > this._prevPot && this._prevPot > 0) {
      const potDisplay = document.getElementById('pot-display');
      potDisplay.classList.add('pot-pulse');
      setTimeout(() => potDisplay.classList.remove('pot-pulse'), 600);
    }

    // Render pot chip pile
    this._renderPotChips(newPot);
    this._prevPot = newPot;

    // Active turn
    const currentPlayer = this._getCurrentPlayer();
    document.getElementById('player-area').classList.toggle('active-turn', currentPlayer === 0 && !this.handOver);
    document.getElementById('opponent-area').classList.toggle('active-turn', currentPlayer === 1 && !this.handOver);

    // Commitments
    const commits = this.game.getCommitments(this.history);
    const playerChipsEl = document.getElementById('player-chips');
    const oppChipsEl = document.getElementById('opponent-chips');
    playerChipsEl.textContent = `Committed: ${commits[0]}`;
    oppChipsEl.textContent = `Committed: ${commits[1]}`;

    // Chip fly + action label animations
    if (commits[0] > this._prevCommits[0]) {
      playerChipsEl.classList.add('chip-animate');
      setTimeout(() => playerChipsEl.classList.remove('chip-animate'), 400);
      const delta = commits[0] - this._prevCommits[0];
      this._animateChipFly('player', delta);
    }
    if (commits[1] > this._prevCommits[1]) {
      oppChipsEl.classList.add('chip-animate');
      setTimeout(() => oppChipsEl.classList.remove('chip-animate'), 400);
      const delta = commits[1] - this._prevCommits[1];
      this._animateChipFly('opponent', delta);
    }

    // Action label float
    if (this._lastAction && this._lastPlayer >= 0) {
      this._showActionLabel(this._lastPlayer, this._lastAction);
    }

    this._prevCommits = [...commits];
    this._lastAction = '';
    this._lastPlayer = -1;
  }

  _renderPotChips(potSize) {
    const container = document.getElementById('pot-chips');
    const currentCount = container.children.length;
    // Each chip represents 2 units
    const targetCount = Math.min(Math.ceil(potSize / 2), 12);

    while (container.children.length < targetCount) {
      const chip = document.createElement('div');
      chip.className = 'pot-chip chip-new';
      container.appendChild(chip);
      setTimeout(() => chip.classList.remove('chip-new'), 400);
    }
    // Remove excess (e.g., new hand)
    while (container.children.length > targetCount) {
      container.removeChild(container.lastChild);
    }
  }

  _animateChipFly(from, amount) {
    const table = document.getElementById('game-table');
    const potEl = document.getElementById('pot-zone');
    const sourceEl = document.getElementById(from === 'player' ? 'player-area' : 'opponent-area');

    const tableRect = table.getBoundingClientRect();
    const potRect = potEl.getBoundingClientRect();
    const sourceRect = sourceEl.getBoundingClientRect();

    const numChips = Math.min(Math.ceil(amount / 2), 4);

    for (let i = 0; i < numChips; i++) {
      const chip = document.createElement('div');
      chip.className = 'chip-fly';

      const startX = sourceRect.left + sourceRect.width * (0.3 + Math.random() * 0.4) - tableRect.left - 9;
      const startY = sourceRect.top + sourceRect.height / 2 - tableRect.top - 9;
      const endX = potRect.left + potRect.width / 2 - tableRect.left - 9 + (Math.random() - 0.5) * 20;
      const endY = potRect.top + potRect.height / 2 - tableRect.top - 9;

      chip.style.left = startX + 'px';
      chip.style.top = startY + 'px';
      chip.style.transition = `all ${0.5 + i * 0.08}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      chip.style.transitionDelay = `${i * 0.06}s`;

      table.appendChild(chip);

      requestAnimationFrame(() => {
        chip.style.left = endX + 'px';
        chip.style.top = endY + 'px';
        chip.style.opacity = '0.2';
        chip.style.transform = 'scale(0.4)';
      });

      setTimeout(() => chip.remove(), 700 + i * 80);
    }
  }

  _showActionLabel(player, actionCode) {
    const table = document.getElementById('game-table');
    const sourceEl = document.getElementById(player === 0 ? 'player-area' : 'opponent-area');
    const tableRect = table.getBoundingClientRect();
    const sourceRect = sourceEl.getBoundingClientRect();

    const labelMap = { F: 'Fold', P: 'Check', C: 'Call', B: 'Bet', R: 'Raise' };
    const classMap = { F: 'label-fold', P: 'label-check', C: 'label-call', B: 'label-bet', R: 'label-raise' };

    const text = labelMap[actionCode];
    const cls = classMap[actionCode];
    if (!text || !cls) return;

    const label = document.createElement('div');
    label.className = `action-label-float ${cls}`;
    label.textContent = text;
    label.style.left = (sourceRect.left + sourceRect.width / 2 - tableRect.left - 25) + 'px';
    label.style.top = (sourceRect.top - tableRect.top - 10) + 'px';

    table.appendChild(label);
    setTimeout(() => label.remove(), 1200);
  }

  _renderPlayerCards() {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';

    const cards = this.playerCards[0];
    let showCards = true;
    if (this.mode === 'pvp' && this._getCurrentPlayer() === 1 && !this.handOver) showCards = false;

    // Check if P0 folded
    const p0Folded = this.handOver && this._didPlayerFold(0);

    for (const card of cards) {
      const el = document.createElement('div');
      if (showCards) {
        const fmt = this.game.formatCard(card);
        el.className = `card face-up card-deal${fmt.red ? ' red' : ''}${p0Folded ? ' folded' : ''}`;
        this._setCardContent(el, fmt);
      } else {
        el.className = 'card face-down card-deal';
      }
      container.appendChild(el);
    }
  }

  _renderOpponentCards() {
    const container = document.getElementById('opponent-cards');
    container.innerHTML = '';

    const cards = this.playerCards[1];
    let showCards = this.handOver;
    if (this.mode === 'bvb') showCards = true;
    if (this.mode === 'pvp' && this._getCurrentPlayer() === 1 && !this.handOver) showCards = true;

    const p1Folded = this.handOver && this._didPlayerFold(1);

    for (const card of cards) {
      const el = document.createElement('div');
      if (showCards) {
        const fmt = this.game.formatCard(card);
        el.className = `card face-up card-deal${fmt.red ? ' red' : ''}${p1Folded ? ' folded' : ''}`;
        this._setCardContent(el, fmt);
      } else {
        el.className = 'card face-down card-deal';
      }
      container.appendChild(el);
    }
  }

  _didPlayerFold(player) {
    // Check if the last action before terminal was a fold by this player
    if (!this.history.endsWith('F')) return false;
    const rounds = this.history.split('//');
    const lastRound = rounds[rounds.length - 1];
    if (!lastRound.endsWith('F')) return false;

    let folderIdx;
    if (this.gameKey === 'limit' && rounds.length === 1) {
      folderIdx = lastRound.length % 2; // preflop P1 acts first
    } else if (this.gameKey === 'limit') {
      folderIdx = (lastRound.length - 1) % 2;
    } else {
      folderIdx = (lastRound.length - 1) % 2;
    }
    return folderIdx === player;
  }

  _setCardContent(el, fmt) {
    if (fmt.suit) {
      const rankSpan = document.createElement('span');
      rankSpan.className = 'card-rank';
      rankSpan.textContent = fmt.rank;

      const suitSpan = document.createElement('span');
      suitSpan.className = `card-suit suit-${fmt.suitName}`;
      suitSpan.textContent = fmt.suit;

      el.appendChild(rankSpan);
      el.appendChild(suitSpan);
    } else {
      el.textContent = fmt.text;
    }
  }

  _renderCommunityCards(show) {
    const container = document.getElementById('community-cards');
    container.innerHTML = '';

    if (!this.communityCards || this.communityCards.length === 0) return;
    if (this.gameKey === 'kuhn') return;

    let numVisible = 0;
    if (this.gameKey === 'leduc') {
      numVisible = show ? 1 : 0;
    } else if (this.gameKey === 'limit') {
      numVisible = this.game.getVisibleCommunity(this.history);
    }

    if (this.handOver) {
      if (this.gameKey === 'leduc') numVisible = 1;
      else if (this.gameKey === 'limit') {
        numVisible = Math.max(numVisible, this.game.getVisibleCommunity(this.history));
      }
    }

    for (let i = 0; i < numVisible; i++) {
      const card = this.communityCards[i];
      const el = document.createElement('div');
      const fmt = this.game.formatCard(card);
      el.className = `card face-up community card-deal${fmt.red ? ' red' : ''}`;
      this._setCardContent(el, fmt);
      container.appendChild(el);
    }
  }

  _getCurrentPlayer() {
    if (this.handOver) return -1;
    return this.game.getActingPlayer(this.history);
  }

  // =====================
  // Game loop
  // =====================

  _processNextAction() {
    if (this.game.isTerminal(this.history)) {
      this._endHand();
      return;
    }

    const actions = this.game.getLegalActions(this.history);

    if (actions.length === 1 && actions[0] === '//') {
      this.history += '//';
      this._logAction(-1, 'Community card dealt', 'log-action');
      this._renderTable();
      this._processNextAction();
      return;
    }

    const currentPlayer = this._getCurrentPlayer();

    if (this.mode === 'bvb') {
      this._doBotAction(currentPlayer);
    } else if (this.mode === 'pvb') {
      if (currentPlayer === 1) {
        this._doBotAction(currentPlayer);
      } else {
        this._showActions(actions, currentPlayer);
      }
    } else {
      this._showActions(actions, currentPlayer);
    }
  }

  _showActions(actions, player) {
    const prompt = document.getElementById('action-prompt');
    const buttons = document.getElementById('action-buttons');

    const playerName = this._getPlayerName(player);
    prompt.textContent = `${playerName}'s turn`;
    if (this.mode === 'pvp') {
      prompt.textContent += ' (don\'t peek at opponent\'s cards!)';
    }

    buttons.innerHTML = '';
    const labels = this.game.getActionLabels(this.history);

    for (const action of actions) {
      const btn = document.createElement('button');
      const label = labels[action] || action;
      btn.className = `btn-action ${label.toLowerCase()}`;
      btn.textContent = label;
      btn.onclick = () => this._humanAction(action, player);
      buttons.appendChild(btn);
    }
  }

  _humanAction(action, player) {
    const desc = this.game.describeAction(action, this.history);
    this._logAction(player, desc, action === 'F' ? 'log-fold' : 'log-action');
    this._lastAction = action;
    this._lastPlayer = player;
    this.history += action;
    this._renderTable();
    this._processNextAction();
  }

  _doBotAction(player) {
    this._showBotStrategy(player);

    const delay = this.mode === 'bvb' ? DELAY_BVB : DELAY_PVB;

    document.getElementById('action-prompt').textContent = `${this._getPlayerName(player)} is thinking...`;
    document.getElementById('action-buttons').innerHTML = '';

    const executeAction = () => {
      const card = this.playerCards[player];
      const community = this.communityCards;

      let action;
      if (this.gameKey === 'kuhn') {
        action = this.game.getBotAction(card[0], this.history);
      } else if (this.gameKey === 'leduc') {
        action = this.game.getBotAction(card[0], this.history, community[0]);
      } else {
        action = this.game.getBotAction(card, this.history, community);
      }

      if (action === '//') {
        this.history += '//';
        this._logAction(-1, 'Community card dealt', 'log-action');
        this._renderTable();
        this._processNextAction();
        return;
      }

      const desc = this.game.describeAction(action, this.history);
      this._logAction(player, desc, action === 'F' ? 'log-fold' : 'log-action');
      this._lastAction = action;
      this._lastPlayer = player;
      this.history += action;
      this._renderTable();
      this._processNextAction();
    };

    this.timer = setTimeout(() => {
      // BvB step-by-step: if not auto-playing, queue the action
      if (this.mode === 'bvb' && !this.autoPlaying) {
        this.pendingAction = executeAction;
        document.getElementById('action-prompt').textContent =
          `${this._getPlayerName(player)} ready — click Step or Auto Play`;
      } else {
        executeAction();
      }
    }, delay);
  }

  _showBotStrategy(player) {
    if (this.mode !== 'bvb') return;

    const card = this.playerCards[player];
    const community = this.communityCards;

    let strat;
    if (this.gameKey === 'kuhn') {
      strat = this.game.getStrategyDisplay(card[0], this.history);
    } else if (this.gameKey === 'leduc') {
      strat = this.game.getStrategyDisplay(card[0], this.history, community[0]);
    } else {
      strat = this.game.getStrategyDisplay(card, this.history, community);
    }

    if (!strat) return;

    const panel = document.getElementById('strategy-panel');
    const display = document.getElementById('strategy-display');
    panel.classList.remove('hidden');

    display.innerHTML = strat.map(s => {
      const pct = (s.prob * 100).toFixed(1);
      const barClass = s.action.toLowerCase().replace(' ', '') + '-bar';
      return `
        <div class="strategy-row">
          <span class="strategy-label">${s.action}</span>
          <div class="strategy-bar-bg">
            <div class="strategy-bar ${barClass}" style="width: ${Math.max(pct, 2)}%">${pct}%</div>
          </div>
        </div>
      `;
    }).join('');
  }

  _endHand() {
    this.handOver = true;

    let result;
    if (this.gameKey === 'kuhn') {
      result = this.game.getPayoff(this.playerCards, this.history);
    } else {
      result = this.game.getPayoff(this.playerCards, this.history, this.communityCards);
    }

    if (result.winner === 0) {
      this.scores[0] += result.amount;
    } else if (result.winner === 1) {
      this.scores[1] += result.amount;
    }

    document.getElementById('p0-score').textContent = this.scores[0];
    document.getElementById('p1-score').textContent = this.scores[1];

    this._renderTable();

    // Result overlay
    const overlay = document.getElementById('result-overlay');
    const resultText = document.getElementById('result-text');
    const resultDetails = document.getElementById('result-details');

    if (result.winner === -1) {
      resultText.textContent = 'Split Pot!';
      resultText.style.color = 'var(--yellow)';
    } else {
      const winnerName = this._getPlayerName(result.winner);
      resultText.textContent = `${winnerName} Wins!`;
      resultText.style.color = result.winner === 0 ? 'var(--green)' : 'var(--red)';
    }

    let cardReveal = '';
    const p0Cards = this.playerCards[0].map(c => this.game.formatCard(c).text).join(' ');
    const p1Cards = this.playerCards[1].map(c => this.game.formatCard(c).text).join(' ');
    cardReveal = `${this._getPlayerName(0)}: ${p0Cards} | ${this._getPlayerName(1)}: ${p1Cards}`;

    if (this.communityCards && this.communityCards.length > 0 && this.gameKey !== 'kuhn') {
      const numVisible = this.gameKey === 'leduc' ? 1 : this.communityCards.length;
      const comCards = this.communityCards.slice(0, numVisible).map(c => this.game.formatCard(c).text).join(' ');
      cardReveal += `\nBoard: ${comCards}`;
    }

    resultDetails.innerHTML = `
      <div>${result.desc}</div>
      <div style="margin-top:8px; font-family: monospace; font-size: 0.9rem;">${cardReveal}</div>
      <div style="margin-top:8px;">Pot: ${result.pot} chips${result.winner >= 0 ? ` | Won: ${result.amount}` : ''}</div>
      <div style="margin-top:4px; font-size:0.8rem; color:var(--text-muted);">History: ${this.history || '(none)'}</div>
    `;

    this._logAction(result.winner, result.desc, result.winner >= 0 ? 'log-win' : '');

    overlay.classList.remove('hidden');

    // BvB auto-advance
    if (this.mode === 'bvb' && this.autoPlaying) {
      this.timer = setTimeout(() => this.nextHand(), DELAY_END_HAND);
    } else if (this.mode === 'bvb') {
      // Step mode: queue next hand
      this.pendingAction = () => this.nextHand();
    }
  }

  _logAction(player, desc, cssClass) {
    const log = document.getElementById('history-log');
    const entry = document.createElement('div');
    entry.className = `log-entry ${cssClass || ''}`;

    const prefix = player >= 0 ? `${this._getPlayerName(player)}: ` : '';
    entry.textContent = `${prefix}${desc}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  _getPlayerName(player) {
    if (this.mode === 'bvb') return player === 0 ? 'Bot 1' : 'Bot 2';
    if (this.mode === 'pvb') return player === 0 ? 'You' : 'Bot';
    return `Player ${player + 1}`;
  }
}

// --- Global Navigation ---

const app = new App();

function selectGame(gameKey) {
  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('info-banner').classList.add('hidden');
  document.getElementById('mode-select').classList.remove('hidden');
  document.getElementById('mode-title').textContent = `${GAME_NAMES[gameKey]} - Select Mode`;
  app.gameKey = gameKey;
}

function backToGameSelect() {
  document.getElementById('mode-select').classList.add('hidden');
  document.getElementById('game-select').classList.remove('hidden');
  document.getElementById('info-banner').classList.remove('hidden');
  document.getElementById('game-area').classList.add('hidden');
  document.getElementById('game-info').classList.add('hidden');
  document.getElementById('playback-controls').classList.add('hidden');
  if (app.timer) clearTimeout(app.timer);
}

function selectMode(mode) {
  document.getElementById('mode-select').classList.add('hidden');
  document.getElementById('game-area').classList.remove('hidden');
  document.getElementById('game-area').classList.add('fade-in');
  app.init(app.gameKey, mode);
}

function backToModeSelect() {
  document.getElementById('game-area').classList.add('hidden');
  document.getElementById('game-info').classList.add('hidden');
  document.getElementById('mode-select').classList.remove('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('playback-controls').classList.add('hidden');
  if (app.timer) clearTimeout(app.timer);
}
