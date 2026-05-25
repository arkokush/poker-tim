"""Export Limit Hold'em strategy only."""
import json
import os

from src.algorithms.mccfr import MCCFR
from src.training.limit_poker import LimitPokerRules

os.makedirs("docs/models", exist_ok=True)

print("Training Limit Hold'em (5k MCCFR iterations)...")
limit = MCCFR(LimitPokerRules())
limit.train(5_000)
strategy = limit.get_strategy()
limit_game = LimitPokerRules()
limit_export = {}
for key, probs in strategy.items():
    history = key.split(":")[1]
    actions = limit_game.get_legal_actions(history)
    if len(actions) == 1 and actions[0] == "//":
        continue
    limit_export[key] = {"actions": actions, "probs": [round(p, 6) for p in probs]}
with open("docs/models/limit_strategy.json", "w") as f:
    json.dump(limit_export, f, indent=2)
print(f"  Exported {len(limit_export)} info sets")
print("Done!")
