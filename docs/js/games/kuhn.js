/**
 * Kuhn Poker - Game Logic
 *
 * 3-card deck (J, Q, K), 2 players, 1 betting round.
 * Actions: P (Pass/Check), B (Bet/Call)
 * Ante: 1 chip each.
 */
class KuhnPoker {
  constructor() {
    this.name = 'Kuhn Poker';
    this.cards = ['J', 'Q', 'K'];
    this.cardValues = { J: 0, Q: 1, K: 2 };
    this.strategy = null;
  }

  async loadStrategy() {
    const resp = await fetch('models/kuhn_strategy.json');
    this.strategy = await resp.json();
  }

  deal() {
    const deck = [...this.cards];
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return {
      playerCards: [[deck[0]], [deck[1]]],
      communityCards: [],
    };
  }

  getActingPlayer(history) {
    return history.length % 2;
  }

  isTerminal(history) {
    return ['PP', 'BP', 'BB', 'PBP', 'PBB'].includes(history);
  }

  getLegalActions(history) {
    return ['P', 'B'];
  }

  getActionLabels(history) {
    // Context-sensitive labels
    if (history.length === 0) {
      return { P: 'Check', B: 'Bet' };
    }
    const last = history[history.length - 1];
    if (last === 'B') {
      return { P: 'Fold', B: 'Call' };
    }
    if (last === 'P') {
      return { P: 'Check', B: 'Bet' };
    }
    return { P: 'Check', B: 'Bet' };
  }

  getPayoff(playerCards, history) {
    const c0 = this.cardValues[playerCards[0][0]];
    const c1 = this.cardValues[playerCards[1][0]];
    const winner = c0 > c1 ? 0 : 1;

    switch (history) {
      case 'PP': return { amount: 1, winner, pot: 2, desc: 'Check-Check' };
      case 'BP': return { amount: 1, winner: 0, pot: 2, desc: 'Player 2 folds' };
      case 'BB': return { amount: 2, winner, pot: 4, desc: 'Bet-Call showdown' };
      case 'PBP': return { amount: 1, winner: 1, pot: 2, desc: 'Player 1 folds' };
      case 'PBB': return { amount: 2, winner, pot: 4, desc: 'Bet-Call showdown' };
    }
    return null;
  }

  getInfoSetKey(playerCard, history) {
    return `${playerCard}:${history}`;
  }

  getBotAction(playerCard, history) {
    const key = this.getInfoSetKey(playerCard, history);
    const entry = this.strategy?.[key];
    if (!entry) {
      // Uniform random fallback
      const actions = this.getLegalActions(history);
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

  getStrategyDisplay(playerCard, history) {
    const key = this.getInfoSetKey(playerCard, history);
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
    let pot = 2; // antes
    for (let i = 0; i < history.length; i++) {
      if (history[i] === 'B') {
        // Check if it's a bet or call
        const preceding = history.substring(0, i);
        if (preceding.includes('B')) {
          pot += 1; // call
        } else {
          pot += 1; // bet
        }
      }
    }
    return pot;
  }

  getCommitments(history) {
    const commits = [1, 1]; // antes
    for (let i = 0; i < history.length; i++) {
      if (history[i] === 'B') {
        commits[i % 2] += 1;
      }
    }
    return commits;
  }

  formatCard(card) {
    return { text: card, red: false };
  }

  getGameInfo() {
    return `
      <h3>Kuhn Poker Rules</h3>
      <ul>
        <li>3-card deck: Jack, Queen, King</li>
        <li>Each player antes 1 chip and is dealt 1 card</li>
        <li>Single betting round with two actions: Check/Bet</li>
        <li>Bet size is fixed at 1 chip</li>
      </ul>
      <h3>Possible Outcomes</h3>
      <ul>
        <li><strong>Check-Check:</strong> Higher card wins the 2-chip pot</li>
        <li><strong>Bet-Fold:</strong> Bettor wins the 2-chip pot uncontested</li>
        <li><strong>Bet-Call:</strong> Higher card wins the 4-chip pot</li>
      </ul>
      <div class="info-highlight">
        Kuhn Poker has a known Nash Equilibrium. Player 1 has a slight disadvantage
        (expected value of -1/18 per hand). The optimal strategy involves mixed
        strategies &mdash; sometimes bluffing with Jack and sometimes checking with King.
      </div>
    `;
  }

  describeAction(action, history) {
    const labels = this.getActionLabels(history);
    return labels[action] || action;
  }
}
