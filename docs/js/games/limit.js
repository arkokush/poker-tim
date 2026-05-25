/**
 * Limit Hold'em - Game Logic
 *
 * 52-card deck, 2 players, 4 betting rounds.
 * Uses equity bucketing (0-7) for bot strategy lookup.
 * Actions: F (Fold), P (Pass/Check), C (Call), B (Bet), R (Raise)
 */
class LimitHoldem {
  constructor() {
    this.name = "Limit Hold'em";
    this.strategy = null;
    this.ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    this.suits = ['c','d','h','s'];
    this.suitSymbols = { c: '\u2663', d: '\u2666', h: '\u2665', s: '\u2660' };
    this.suitColors = { c: false, d: true, h: true, s: false };
  }

  async loadStrategy() {
    const resp = await fetch('models/limit_strategy.json');
    this.strategy = await resp.json();
  }

  _buildDeck() {
    const deck = [];
    for (let i = 0; i < 52; i++) deck.push(i);
    return deck;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _cardRank(id) { return Math.floor(id / 4); }
  _cardSuit(id) { return id % 4; }

  _cardStr(id) {
    return this.ranks[this._cardRank(id)] + this.suits[this._cardSuit(id)];
  }

  _cardDisplay(id) {
    const r = this.ranks[this._cardRank(id)];
    const s = this._cardSuit(id);
    return {
      text: r + this.suitSymbols[this.suits[s]],
      red: this.suitColors[this.suits[s]],
    };
  }

  deal() {
    const deck = this._shuffle(this._buildDeck());
    return {
      playerCards: [[deck[0], deck[1]], [deck[2], deck[3]]],
      communityCards: [deck[4], deck[5], deck[6], deck[7], deck[8]],
    };
  }

  getActingPlayer(history) {
    const rounds = history.split('//');
    const currentLen = rounds[rounds.length - 1].length;
    if (rounds.length === 1) {
      // Preflop: player 1 (SB/BTN) acts first
      return (currentLen + 1) % 2;
    }
    return currentLen % 2;
  }

  _isRoundComplete(r, isPreflop) {
    if (r === '') return false;
    if (r.endsWith('F')) return true;
    if (r.endsWith('C') && r.length >= 2) return true;
    if (r === 'PP') return true;
    if (isPreflop && r === 'CP') return true;
    return false;
  }

  isTerminal(history) {
    const rounds = history.split('//');
    for (let i = 0; i < rounds.length; i++) {
      if (rounds[i] === '') return false;
      if (rounds[i].endsWith('F')) return true;
      if (!this._isRoundComplete(rounds[i], i === 0)) return false;
    }
    return rounds.length === 4;
  }

  getStreet(history) {
    return history.split('//').length - 1;
  }

  getVisibleCommunity(history) {
    const street = this.getStreet(history);
    if (street === 0) return 0;
    if (street === 1) return 3;
    if (street === 2) return 4;
    return 5;
  }

  getLegalActions(history) {
    const rounds = history.split('//');
    const current = rounds[rounds.length - 1];
    const isPreflop = rounds.length === 1;

    // Transition to next street
    if (rounds.length < 4 && this._isRoundComplete(current, isPreflop)) {
      return ['//'];
    }

    if (current === '') return ['P', 'B'];

    const prev = current[current.length - 1];
    const raiseCount = (current.match(/R/g) || []).length;

    if (prev === 'P') return ['P', 'B'];
    if (prev === 'B' || prev === 'R') {
      if (raiseCount >= 3) return ['F', 'C'];
      return ['F', 'C', 'R'];
    }
    return [];
  }

  getActionLabels() {
    return { F: 'Fold', P: 'Check', C: 'Call', B: 'Bet', R: 'Raise' };
  }

  _calculateCommitments(history) {
    const rounds = history.includes('//') ? history.split('//') : [history];
    const commitments = [1, 1]; // blinds

    for (let ri = 0; ri < rounds.length; ri++) {
      const rh = rounds[ri];
      const betSize = ri <= 1 ? 2 : 4;
      const commit = [0, 0];
      let currentBet = 0;

      if (ri === 0) {
        commit[0] = 1;  // SB already posted
        currentBet = 1;
      }

      for (let ai = 0; ai < rh.length; ai++) {
        const player = ri === 0 ? (ai + 1) % 2 : ai % 2;
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

  // Simplified hand evaluator for browser
  _evaluateHand(holeCards, board) {
    const allCards = [...holeCards, ...board];
    if (allCards.length < 5) return 0;

    // Generate all 5-card combinations
    let bestRank = -1;
    const combos = this._combinations(allCards, 5);
    for (const combo of combos) {
      const rank = this._rank5Cards(combo);
      if (rank > bestRank) bestRank = rank;
    }
    return bestRank;
  }

  _combinations(arr, k) {
    const result = [];
    const combo = [];
    const backtrack = (start) => {
      if (combo.length === k) { result.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        backtrack(i + 1);
        combo.pop();
      }
    };
    backtrack(0);
    return result;
  }

  _rank5Cards(cards) {
    const ranks = cards.map(c => this._cardRank(c)).sort((a, b) => a - b);
    const suits = cards.map(c => this._cardSuit(c));

    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;
    const unique = [...new Set(ranks)].sort((a, b) => a - b);

    if (unique.length === 5) {
      if (unique[4] - unique[0] === 4) {
        isStraight = true;
        straightHigh = unique[4];
      }
      // Ace-low straight (A-2-3-4-5)
      if (unique[0] === 0 && unique[1] === 1 && unique[2] === 2 && unique[3] === 3 && unique[4] === 12) {
        isStraight = true;
        straightHigh = 3; // 5-high
      }
    }

    // Count rank occurrences
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.entries(counts).map(([r, c]) => ({ rank: parseInt(r), count: c }));
    groups.sort((a, b) => b.count - a.count || b.rank - a.rank);

    const pattern = groups.map(g => g.count).join('');

    // Scoring: higher = better
    // Royal/Straight Flush: 8, Quads: 7, Full House: 6, Flush: 5
    // Straight: 4, Three of a Kind: 3, Two Pair: 2, Pair: 1, High Card: 0

    if (isStraight && isFlush) return 8 * 1000000 + straightHigh * 100;
    if (pattern === '41') return 7 * 1000000 + groups[0].rank * 1000 + groups[1].rank;
    if (pattern === '32') return 6 * 1000000 + groups[0].rank * 1000 + groups[1].rank;
    if (isFlush) return 5 * 1000000 + ranks[4] * 10000 + ranks[3] * 1000 + ranks[2] * 100 + ranks[1] * 10 + ranks[0];
    if (isStraight) return 4 * 1000000 + straightHigh * 100;
    if (pattern === '311') return 3 * 1000000 + groups[0].rank * 10000 + groups[1].rank * 100 + groups[2].rank;
    if (pattern === '221') return 2 * 1000000 + groups[0].rank * 10000 + groups[1].rank * 100 + groups[2].rank;
    if (pattern === '2111') return 1 * 1000000 + groups[0].rank * 10000 + groups[1].rank * 100 + groups[2].rank * 10 + groups[3].rank;
    return 0 * 1000000 + ranks[4] * 10000 + ranks[3] * 1000 + ranks[2] * 100 + ranks[1] * 10 + ranks[0];
  }

  // Estimate equity via Monte Carlo
  _estimateEquity(holeCards, board, samples = 200) {
    const usedCards = new Set([...holeCards, ...board]);
    const remaining = [];
    for (let i = 0; i < 52; i++) {
      if (!usedCards.has(i)) remaining.push(i);
    }

    let wins = 0;
    let total = 0;

    for (let s = 0; s < samples; s++) {
      const shuffled = this._shuffle([...remaining]);
      let idx = 0;

      // Deal opponent cards
      const oppCards = [shuffled[idx++], shuffled[idx++]];

      // Complete board
      const fullBoard = [...board];
      while (fullBoard.length < 5) {
        fullBoard.push(shuffled[idx++]);
      }

      const myRank = this._evaluateHand(holeCards, fullBoard);
      const oppRank = this._evaluateHand(oppCards, fullBoard);

      if (myRank > oppRank) wins++;
      else if (myRank === oppRank) wins += 0.5;
      total++;
    }

    return wins / total;
  }

  _equityBucket(winProb) {
    return Math.min(Math.floor(winProb * 8), 7);
  }

  getInfoSetKey(holeCards, history, communityCards) {
    const street = this.getStreet(history);
    const board = communityCards.slice(0, this.getVisibleCommunity(history));

    let winProb;
    if (board.length === 0) {
      winProb = this._estimateEquity(holeCards, [], 300);
    } else {
      winProb = this._estimateEquity(holeCards, board, 200);
    }

    const bucket = this._equityBucket(winProb);
    return `b${bucket}:${history}`;
  }

  getBotAction(holeCards, history, communityCards) {
    const actions = this.getLegalActions(history);

    if (actions.length === 1 && actions[0] === '//') return '//';

    const key = this.getInfoSetKey(holeCards, history, communityCards);
    const entry = this.strategy?.[key];

    if (!entry) {
      // Fallback: filter to reasonable actions (avoid random fold)
      const safe = actions.filter(a => a !== 'F');
      return safe[Math.floor(Math.random() * safe.length)];
    }

    const r = Math.random();
    let cum = 0;
    for (let i = 0; i < entry.actions.length; i++) {
      cum += entry.probs[i];
      if (r < cum) return entry.actions[i];
    }
    return entry.actions[entry.actions.length - 1];
  }

  getStrategyDisplay(holeCards, history, communityCards) {
    const key = this.getInfoSetKey(holeCards, history, communityCards);
    const entry = this.strategy?.[key];
    if (!entry) return null;

    const labels = this.getActionLabels();
    return entry.actions.map((a, i) => ({
      action: labels[a] || a,
      code: a,
      prob: entry.probs[i],
    }));
  }

  getPayoff(playerCards, history, communityCards) {
    const commits = this._calculateCommitments(history);
    const pot = commits[0] + commits[1];
    const rounds = history.split('//');

    // Check folds
    for (let ri = 0; ri < rounds.length; ri++) {
      const r = rounds[ri];
      if (r.endsWith('F')) {
        let folder;
        if (ri === 0) {
          folder = r.length % 2; // preflop: P1 acts first
        } else {
          folder = (r.length - 1) % 2;
        }
        return {
          amount: commits[1 - folder],
          winner: 1 - folder,
          pot,
          desc: `Player ${folder + 1} folds`,
        };
      }
    }

    // Showdown
    const rank0 = this._evaluateHand(playerCards[0], communityCards);
    const rank1 = this._evaluateHand(playerCards[1], communityCards);

    if (rank0 > rank1) {
      return { amount: commits[1], winner: 0, pot, desc: 'Player 1 wins at showdown' };
    } else if (rank1 > rank0) {
      return { amount: commits[0], winner: 1, pot, desc: 'Player 2 wins at showdown' };
    }
    return { amount: 0, winner: -1, pot, desc: 'Split pot' };
  }

  getPotSize(history) {
    const commits = this._calculateCommitments(history);
    return commits[0] + commits[1];
  }

  getCommitments(history) {
    return this._calculateCommitments(history);
  }

  formatCard(cardId) {
    return this._cardDisplay(cardId);
  }

  getGameInfo() {
    return `
      <h3>Limit Hold'em Rules</h3>
      <ul>
        <li>Standard 52-card deck, 2 players</li>
        <li>Each player posts blinds (SB: 1, BB: 2) and is dealt 2 hole cards</li>
        <li>4 betting rounds: Preflop, Flop (3 cards), Turn (1 card), River (1 card)</li>
        <li>Fixed bet sizes: 2 chips (preflop/flop), 4 chips (turn/river)</li>
        <li>Maximum 3 raises per betting round</li>
      </ul>
      <h3>Hand Rankings (strongest to weakest)</h3>
      <ul>
        <li>Royal Flush &gt; Straight Flush &gt; Four of a Kind &gt; Full House</li>
        <li>Flush &gt; Straight &gt; Three of a Kind &gt; Two Pair &gt; Pair &gt; High Card</li>
      </ul>
      <h3>Equity Bucketing</h3>
      <div class="info-highlight">
        The bot uses <strong>equity bucketing</strong> to handle the massive game tree.
        Instead of tracking every card combination, it estimates its win probability and
        maps it to one of 8 buckets (0 = weakest, 7 = strongest). This abstraction makes
        training tractable while preserving strategic depth. The strategy was trained
        using Monte Carlo CFR (MCCFR) with external sampling.
      </div>
    `;
  }

  describeAction(action, history) {
    if (action === '//') {
      const street = this.getStreet(history);
      const names = ['', 'Flop dealt', 'Turn dealt', 'River dealt'];
      return names[street] || 'Next street';
    }
    const labels = this.getActionLabels();
    return labels[action] || action;
  }
}
