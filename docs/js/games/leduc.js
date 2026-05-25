/**
 * Leduc Poker - Game Logic
 *
 * 6-card deck (J×2, Q×2, K×2), 2 players, 2 betting rounds.
 * Round 1: deal 1 card each, bet (size 2).
 * Round 2: deal 1 community card, bet (size 4).
 * Actions: F (Fold), P (Pass/Check), C (Call), B (Bet), R (Raise)
 */
class LeducPoker {
  constructor() {
    this.name = 'Leduc Poker';
    this.cards = ['J1', 'J2', 'Q1', 'Q2', 'K1', 'K2'];
    this.rankMap = { J1: 'J', J2: 'J', Q1: 'Q', Q2: 'Q', K1: 'K', K2: 'K' };
    this.rankValues = { J: 0, Q: 1, K: 2 };
    this.strategy = null;
  }

  async loadStrategy() {
    const resp = await fetch('models/leduc_strategy.json');
    this.strategy = await resp.json();
  }

  deal() {
    const deck = [...this.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return {
      playerCards: [[deck[0]], [deck[1]]],
      communityCards: [deck[2]],
    };
  }

  getRank(card) {
    return this.rankMap[card] || card;
  }

  getActingPlayer(history) {
    const rounds = history.split('//');
    return rounds[rounds.length - 1].length % 2;
  }

  _roundTerminal(r) {
    return r.endsWith('F') || r.endsWith('C') || r === 'PP';
  }

  isTerminal(history) {
    const rounds = history.split('//');
    const r1 = rounds[0];
    const r2 = rounds.length > 1 ? rounds[1] : '';

    if (r1.endsWith('F')) return true;
    if (!this._roundTerminal(r1)) return false;
    if (r2 === '') return false;
    return this._roundTerminal(r2);
  }

  isRound1Complete(history) {
    const rounds = history.split('//');
    return this._roundTerminal(rounds[0]) && !rounds[0].endsWith('F');
  }

  showCommunity(history) {
    return history.includes('//');
  }

  getLegalActions(history) {
    const rounds = history.split('//');
    const r1 = rounds[0];
    const r2 = rounds.length > 1 ? rounds[1] : null;

    // Transition to round 2
    if (r2 === null && this._roundTerminal(r1)) {
      return ['//'];
    }

    const current = rounds[rounds.length - 1];

    if (current === '') return ['P', 'B'];

    const prev = current[current.length - 1];
    if (prev === 'P') return ['P', 'B'];
    if (prev === 'B') {
      return ['F', 'C', 'R'];
    }
    if (prev === 'R') {
      const raises = current.split('R').length - 1;
      if (raises >= 2) return ['F', 'C'];
      return ['F', 'C', 'R'];
    }
    return [];
  }

  getActionLabels(history) {
    return { F: 'Fold', P: 'Check', C: 'Call', B: 'Bet', R: 'Raise' };
  }

  _calculateCommitments(history) {
    const rounds = history.includes('//') ? history.split('//') : [history];
    const commitments = [1, 1]; // antes

    for (let ri = 0; ri < rounds.length; ri++) {
      const rh = rounds[ri];
      const betSize = ri === 0 ? 2 : 4;
      const commit = [0, 0];
      let currentBet = 0;

      for (let ai = 0; ai < rh.length; ai++) {
        const player = ai % 2;
        const action = rh[ai];

        if (action === 'B') {
          currentBet = betSize;
          commit[player] = currentBet;
        } else if (action === 'R') {
          currentBet += betSize;
          commit[player] = currentBet;
        } else if (action === 'C') {
          commit[player] = currentBet;
        }
      }

      commitments[0] += commit[0];
      commitments[1] += commit[1];
    }

    return commitments;
  }

  _handRank(cardRank, boardRank) {
    // Pair is strongest
    if (cardRank === boardRank) return 10 + this.rankValues[cardRank];
    // Otherwise high card
    return this.rankValues[cardRank];
  }

  getPayoff(playerCards, history, communityCards) {
    const commits = this._calculateCommitments(history);
    const pot = commits[0] + commits[1];
    const rounds = history.split('//');
    const r1 = rounds[0];
    const r2 = rounds.length > 1 ? rounds[1] : '';

    // Fold in round 1
    if (r1.endsWith('F')) {
      const folder = (r1.length - 1) % 2;
      return {
        amount: commits[1 - folder],
        winner: 1 - folder,
        pot,
        desc: `Player ${folder + 1} folds`,
      };
    }

    // Fold in round 2
    if (r2.endsWith('F')) {
      const folder = (r2.length - 1) % 2;
      return {
        amount: commits[1 - folder],
        winner: 1 - folder,
        pot,
        desc: `Player ${folder + 1} folds`,
      };
    }

    // Showdown
    const rank0 = this._handRank(this.getRank(playerCards[0][0]), this.getRank(communityCards[0]));
    const rank1 = this._handRank(this.getRank(playerCards[1][0]), this.getRank(communityCards[0]));

    let winner, desc;
    if (rank0 > rank1) {
      winner = 0;
      desc = 'Player 1 wins at showdown';
    } else if (rank1 > rank0) {
      winner = 1;
      desc = 'Player 2 wins at showdown';
    } else {
      return { amount: 0, winner: -1, pot, desc: 'Split pot' };
    }

    return { amount: commits[1 - winner], winner, pot, desc };
  }

  getInfoSetKey(playerCard, history, communityCard) {
    const rank = this.getRank(playerCard);
    const rounds = history.split('//');
    if (rounds.length <= 1) {
      return `${rank}:${history}`;
    }
    const comRank = this.getRank(communityCard);
    return `${rank}|${comRank}:${history}`;
  }

  getBotAction(playerCard, history, communityCard) {
    const actions = this.getLegalActions(history);

    // Auto-transition
    if (actions.length === 1 && actions[0] === '//') {
      return '//';
    }

    const key = this.getInfoSetKey(playerCard, history, communityCard);
    const entry = this.strategy?.[key];

    if (!entry) {
      return actions[Math.floor(Math.random() * actions.length)];
    }

    const r = Math.random();
    let cum = 0;
    for (let i = 0; i < entry.actions.length; i++) {
      cum += entry.probs[i];
      if (r < cum) return entry.actions[i];
    }
    return entry.actions[entry.actions.length - 1];
  }

  getStrategyDisplay(playerCard, history, communityCard) {
    const key = this.getInfoSetKey(playerCard, history, communityCard);
    const entry = this.strategy?.[key];
    if (!entry) return null;

    const labels = this.getActionLabels(history);
    return entry.actions.map((a, i) => ({
      action: labels[a] || a,
      code: a,
      prob: entry.probs[i],
    }));
  }

  getPotSize(history) {
    const commits = this._calculateCommitments(history);
    return commits[0] + commits[1];
  }

  getCommitments(history) {
    return this._calculateCommitments(history);
  }

  formatCard(card) {
    const rank = this.getRank(card);
    return { text: rank, red: false };
  }

  getGameInfo() {
    return `
      <h3>Leduc Poker Rules</h3>
      <ul>
        <li>6-card deck: Jack &times; 2, Queen &times; 2, King &times; 2</li>
        <li>Each player antes 1 chip and is dealt 1 card</li>
        <li>Two betting rounds with fixed bet sizes</li>
        <li>Round 1 bet size: 2 chips | Round 2 bet size: 4 chips</li>
        <li>After round 1, one community card is dealt</li>
      </ul>
      <h3>Hand Rankings (strongest to weakest)</h3>
      <ul>
        <li><strong>Pair:</strong> Your card matches the community card (e.g., K-K)</li>
        <li><strong>High Card:</strong> K &gt; Q &gt; J</li>
      </ul>
      <h3>Actions</h3>
      <ul>
        <li><strong>Check:</strong> Pass the action (no bet)</li>
        <li><strong>Bet:</strong> Put chips in (2 in round 1, 4 in round 2)</li>
        <li><strong>Call:</strong> Match the current bet</li>
        <li><strong>Raise:</strong> Increase the bet (up to 2 raises per round)</li>
        <li><strong>Fold:</strong> Surrender your hand and lose invested chips</li>
      </ul>
      <div class="info-highlight">
        Leduc Poker is a popular research benchmark for poker AI. Despite its small size,
        it captures key poker concepts like bluffing, value betting, and position advantage.
        The trained strategy uses ~400 information sets.
      </div>
    `;
  }

  describeAction(action, history) {
    if (action === '//') return 'Community card dealt';
    const labels = this.getActionLabels(history);
    return labels[action] || action;
  }
}
