import random
from typing import Dict
from .info_set import InformationSet
from src.training.base import PokerGameRules


class MCCFR:
    """
    External Sampling MCCFR.

    - Traverser: enumerate all actions
    - Opponent: sample one action according to current strategy
    """

    def __init__(self, game: PokerGameRules):
        self.game = game
        self.info_sets: Dict[str, InformationSet] = {}
        self.t = 0

    def get_info_set(self, key: str, num_actions: int) -> InformationSet:
        if key not in self.info_sets:
            self.info_sets[key] = InformationSet(num_actions)
        return self.info_sets[key]

    def train(self, iterations: int):
        for _ in range(iterations):
            self.t += 1
            cards = self.game.deal_cards()
            self.traverse(cards, "", 0)
            self.traverse(cards, "", 1)

    def sample_action(self, strategy):
        r = random.random()
        cum = 0.0
        for i, p in enumerate(strategy):
            cum += p
            if r < cum:
                return i
        return len(strategy) - 1

    def traverse(self, cards, history, traversing_player):
        player = self.game.get_acting_player(history)

        player_card = cards[player]
        flop = cards[2] if len(cards) > 2 else None
        turn = cards[3] if len(cards) > 3 else None
        river = cards[4] if len(cards) > 4 else None
        board = (flop, turn, river)

        if self.game.is_terminal(history):
            payoff_p0 = self.game.get_payoff(cards[:2], history, board)
            return payoff_p0 if traversing_player == 0 else -payoff_p0

        actions = self.game.get_legal_actions(history)

        # Forced transitions (e.g., round separator) — just recurse, no decision
        if len(actions) == 1 and actions[0] not in ('F', 'P', 'C', 'B', 'R'):
            return self.traverse(cards, history + actions[0], traversing_player)

        key = self.game.get_info_set_string(player_card, history, board)
        info_set = self.get_info_set(key, len(actions))
        strategy = info_set.get_strategy()

        if player == traversing_player:
            # Update average strategy (linear weighting by iteration)
            for i in range(len(actions)):
                info_set.strategy_sum[i] += self.t * strategy[i]

            action_utils = [0.0] * len(actions)
            node_util = 0.0

            for i, action in enumerate(actions):
                action_utils[i] = self.traverse(
                    cards, history + action, traversing_player
                )
                node_util += strategy[i] * action_utils[i]

            # Standard regret update — no decay
            for i in range(len(actions)):
                info_set.regret_sum[i] += action_utils[i] - node_util

            return node_util

        else:
            # Opponent: sample one action
            sampled_idx = self.sample_action(strategy)
            action = actions[sampled_idx]
            return self.traverse(
                cards, history + action, traversing_player
            )

    def get_strategy(self):
        return {
            k: v.get_average_strategy()
            for k, v in self.info_sets.items()
        }
