/**
 * PokerBot - Main Application Controller
 * Manages game selection, mode switching, and gameplay loop.
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

class App {
  constructor() {
    this.gameKey = null;
    this.game = null;
    this.mode = null;
    this.scores = [0, 0];
    this.handNum = 0;

    // Current hand state
    this.playerCards = null;
    this.communityCards = null;
    this.history = '';
    this.dealerButton = 0; // alternates each hand
    this.handOver = false;
    this.bvbTimer = null;
    this.bvbRunning = false;
  }

  async init(gameKey, mode) {
    this.gameKey = gameKey;
    this.game = GAMES[gameKey]();
    this.mode = mode;
    this.scores = [0, 0];
    this.handNum = 0;

    // Load strategy if needed
    if (mode === 'pvb' || mode === 'bvb') {
      try {
        await this.game.loadStrategy();
      } catch (e) {
        console.error('Failed to load strategy:', e);
        alert('Failed to load bot strategy. Make sure model files exist in docs/models/.');
        return;
      }
    }

    // Setup UI
    this._setupLabels();
    this.startHand();
  }

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

    // Show game info
    const infoSection = document.getElementById('game-info');
    const infoContent = document.getElementById('game-info-content');
    infoContent.innerHTML = this.game.getGameInfo();
    infoSection.classList.remove('hidden');
  }

  startHand() {
    this.handNum++;
    this.history = '';
    this.handOver = false;

    const dealt = this.game.deal();
    this.playerCards = dealt.playerCards;
    this.communityCards = dealt.communityCards;

    document.getElementById('hand-count').textContent = `Hand #${this.handNum}`;
    document.getElementById('result-overlay').classList.add('hidden');

    // Clear history log
    document.getElementById('history-log').innerHTML = '';
    document.getElementById('strategy-panel').classList.add('hidden');

    this._renderTable();
    this._processNextAction();
  }

  nextHand() {
    this.dealerButton = 1 - this.dealerButton;
    if (this.bvbTimer) {
      clearTimeout(this.bvbTimer);
      this.bvbTimer = null;
    }
    this.startHand();
  }

  _renderTable() {
    const currentPlayer = this._getCurrentPlayer();
    const showCommunity = this.gameKey === 'leduc'
      ? this.game.showCommunity(this.history)
      : (this.gameKey === 'limit' ? this.game.getVisibleCommunity(this.history) > 0 : false);

    // Render player cards (bottom - always P0 perspective)
    this._renderPlayerCards();

    // Render opponent cards (top)
    this._renderOpponentCards();

    // Render community cards
    this._renderCommunityCards(showCommunity);

    // Render pot
    document.getElementById('pot-amount').textContent = this.game.getPotSize(this.history);

    // Active turn indicator
    document.getElementById('player-area').classList.toggle('active-turn', currentPlayer === 0 && !this.handOver);
    document.getElementById('opponent-area').classList.toggle('active-turn', currentPlayer === 1 && !this.handOver);

    // Chips committed
    const commits = this.game.getCommitments(this.history);
    document.getElementById('player-chips').textContent = `Committed: ${commits[0]}`;
    document.getElementById('opponent-chips').textContent = `Committed: ${commits[1]}`;
  }

  _renderPlayerCards() {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';

    const cards = this.playerCards[0];
    // P0 cards: always visible except in PvP when it's P1's turn
    let showCards = true;
    if (this.mode === 'pvp' && this._getCurrentPlayer() === 1 && !this.handOver) showCards = false;

    for (const card of cards) {
      const el = document.createElement('div');
      if (showCards) {
        const fmt = this.game.formatCard(card);
        el.className = `card face-up card-deal${fmt.red ? ' red' : ''}`;
        el.textContent = fmt.text;
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
    // P1 cards: visible at showdown, in BvB always, in PvP only on P1's turn
    let showCards = this.handOver;
    if (this.mode === 'bvb') showCards = true;
    if (this.mode === 'pvp' && this._getCurrentPlayer() === 1 && !this.handOver) showCards = true;

    for (const card of cards) {
      const el = document.createElement('div');
      if (showCards) {
        const fmt = this.game.formatCard(card);
        el.className = `card face-up card-deal${fmt.red ? ' red' : ''}`;
        el.textContent = fmt.text;
      } else {
        el.className = 'card face-down card-deal';
      }
      container.appendChild(el);
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

    // Show at end of hand: all community cards that were dealt
    if (this.handOver) {
      if (this.gameKey === 'leduc') numVisible = 1;
      else if (this.gameKey === 'limit') {
        // Show all that were dealt during the hand
        numVisible = Math.max(numVisible, this.game.getVisibleCommunity(this.history));
      }
    }

    for (let i = 0; i < numVisible; i++) {
      const card = this.communityCards[i];
      const el = document.createElement('div');
      const fmt = this.game.formatCard(card);
      el.className = `card face-up community card-deal${fmt.red ? ' red' : ''}`;
      el.textContent = fmt.text;
      container.appendChild(el);
    }
  }

  _getCurrentPlayer() {
    if (this.handOver) return -1;
    return this.game.getActingPlayer(this.history);
  }

  _processNextAction() {
    if (this.game.isTerminal(this.history)) {
      this._endHand();
      return;
    }

    const actions = this.game.getLegalActions(this.history);

    // Auto-transitions (e.g., //)
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
        // Bot's turn
        this._doBotAction(currentPlayer);
      } else {
        // Human's turn
        this._showActions(actions, currentPlayer);
      }
    } else {
      // PvP - show actions for current player
      this._showActions(actions, currentPlayer);
    }
  }

  _showActions(actions, player) {
    const bar = document.getElementById('action-bar');
    const prompt = document.getElementById('action-prompt');
    const buttons = document.getElementById('action-buttons');

    const playerName = this._getPlayerName(player);
    prompt.textContent = `${playerName}'s turn`;

    // In PvP, remind them not to look at opponent's cards
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

    // Show strategy hint for PvB (bot's perspective shown after hand)
    bar.classList.remove('hidden');
  }

  _humanAction(action, player) {
    const desc = this.game.describeAction(action, this.history);
    this._logAction(player, desc, action === 'F' ? 'log-fold' : 'log-action');
    this.history += action;
    this._renderTable();
    this._processNextAction();
  }

  _doBotAction(player) {
    // Show strategy if configured
    this._showBotStrategy(player);

    const delay = this.mode === 'bvb' ? 800 : 500;

    document.getElementById('action-prompt').textContent = `${this._getPlayerName(player)} is thinking...`;
    document.getElementById('action-buttons').innerHTML = '';

    this.bvbTimer = setTimeout(() => {
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

      // Handle auto-transitions
      if (action === '//') {
        this.history += '//';
        this._logAction(-1, 'Community card dealt', 'log-action');
        this._renderTable();
        this._processNextAction();
        return;
      }

      const desc = this.game.describeAction(action, this.history);
      this._logAction(player, desc, action === 'F' ? 'log-fold' : 'log-action');
      this.history += action;
      this._renderTable();
      this._processNextAction();
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
    } else if (this.gameKey === 'leduc') {
      result = this.game.getPayoff(this.playerCards, this.history, this.communityCards);
    } else {
      result = this.game.getPayoff(this.playerCards, this.history, this.communityCards);
    }

    // Update scores
    if (result.winner === 0) {
      this.scores[0] += result.amount;
    } else if (result.winner === 1) {
      this.scores[1] += result.amount;
    }

    document.getElementById('p0-score').textContent = this.scores[0];
    document.getElementById('p1-score').textContent = this.scores[1];

    // Render final state (show all cards)
    this._renderTable();

    // Show result
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

      if (this.mode === 'pvb' && result.winner === 0) {
        resultText.style.color = 'var(--green)';
      } else if (this.mode === 'pvb' && result.winner === 1) {
        resultText.style.color = 'var(--red)';
      }
    }

    // Card reveal
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

    // Show final strategy for bot player(s) if applicable
    if (this.mode === 'pvb' || this.mode === 'bvb') {
      this._showPostHandStrategy();
    }

    // Auto-advance for BvB
    if (this.mode === 'bvb' && this.bvbRunning) {
      this.bvbTimer = setTimeout(() => this.nextHand(), 2000);
    }
  }

  _showPostHandStrategy() {
    // Nothing extra needed - strategy was shown during play for BvB
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
  if (app.bvbTimer) clearTimeout(app.bvbTimer);
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
  if (app.bvbTimer) clearTimeout(app.bvbTimer);
}
