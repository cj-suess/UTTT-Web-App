Future Learning Feature Improvements:

    Revisit if the LLM explanations feel too shallow or lack long-term depth.

    Intermediate MCTS win probabilities: Currently the hint uses cached analysis from the AI's last move (Option B). We have one recommended move for X via PV[1] but no ranking of X's alternatives, and no win probability at each step of the principal variation. 
    
    Getting those would require running fresh MCTS at each PV position — expensive but potentially distributable across workers similar to the training setup. Revisit if LLM explanations feel shallow.

    We also don't have explanations for why specific branches were rejected, only that they were explored less. The MCTS knows "this path is bad" but doesn't record why in a human-readable way.

