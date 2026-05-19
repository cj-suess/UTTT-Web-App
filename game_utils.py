import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import random
import copy
from collections import deque


def _generate_symmetry_indices():
    # generates a (8, 81) lookup table for all 8 symmetries | maps current index -> new index based on spatial rotation
    base = np.arange(81)
    # convert linear index to spatial row, col
    m = base // 9
    c = base % 9
    mr, mc = m // 3, m % 3
    cr, cc = c // 3, c % 3
    
    # global spatial coordinates (0-8)
    rows = mr * 3 + cr
    cols = mc * 3 + cc
    
    perms = []
    for flip in [False, True]:
        # 0, 90, 180, 270
        for rot in [0, 1, 2, 3]:
            r, c_coord = rows.copy(), cols.copy()
            
            if flip:
                c_coord = 8 - c_coord # flip horizontal
            
            for _ in range(rot):
                # rotate 90 deg clockwise: (r, c) -> (c, 8-r)
                r, c_coord = c_coord, 8 - r
            
            # convert back to linear indices
                # new macro = (r//3)*3 + (c//3)
                # new micro = (r%3)*3 + (c%3)
            new_m = (r // 3) * 3 + (c_coord // 3)
            new_c = (r % 3) * 3 + (c_coord % 3)
            new_idx = new_m * 9 + new_c
            perms.append(new_idx)
            
    return np.array(perms)

# pre-calculate once
SYMMETRY_INDICES = _generate_symmetry_indices()

class UTTTState:
    X, O, EMPTY, DRAW = 1, -1, 0, 2
    WIN_LINES = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),
        (0, 3, 6), (1, 4, 7), (2, 5, 8),
        (0, 4, 8), (2, 4, 6)
    ]

    def __init__(self, board=None, macro=None, player=1, next_micro=None):
        self.board = board if board is not None else tuple([0] * 81)
        self.macro = macro if macro is not None else tuple([0] * 9)
        self.player = player
        self.next_micro = next_micro

    @staticmethod
    def check_winner_3x3(cells):
        for a, b, c in UTTTState.WIN_LINES:
            if cells[a] != 0 and cells[a] != 2 and cells[a] == cells[b] == cells[c]:
                return cells[a]
        if all(v != 0 for v in cells):
            return 2
        return None

    def is_terminal(self):
        macro_winner = self.check_winner_3x3(self.macro)
        if macro_winner is not None:
            return True
        if all(v != 0 for v in self.macro):
            return True
        return False

    def evaluate(self):
        winner = self.check_winner_3x3(self.macro)
        if winner == UTTTState.X: return 1.0
        if winner == UTTTState.O: return -1.0
        return 0.0

    def get_actions(self):
        moves = []
        if self.next_micro is None:
            micros = range(9)
        else:
            if self.macro[self.next_micro] != 0:
                micros = range(9)
            else:
                micros = [self.next_micro]

        for m in micros:
            if self.macro[m] != 0: continue
            base = m * 9
            for c in range(9):
                if self.board[base + c] == 0:
                    moves.append((m, c))
        return moves

    def apply(self, move):
        m, c = move
        idx = m * 9 + c
        new_board = list(self.board)
        new_board[idx] = self.player
        new_board = tuple(new_board)
        
        micro_cells = new_board[m * 9 : m * 9 + 9]
        micro_winner = self.check_winner_3x3(micro_cells)
        new_macro = list(self.macro)
        if micro_winner is not None and new_macro[m] == 0:
            new_macro[m] = micro_winner
        new_macro = tuple(new_macro)
        
        next_m = c
        if new_macro[next_m] != 0:
            next_m = None
        
        return UTTTState(board=new_board, macro=new_macro, player=-self.player, next_micro=next_m)

    def to_key(self):
        return (self.board, self.macro, self.player, self.next_micro)


class UTTTNet(nn.Module):
    
    def __init__(self, channels=128, num_res_blocks=10):
        super(UTTTNet, self).__init__()
        self.conv1 = nn.Conv2d(4, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.res_blocks = nn.ModuleList([self._make_res_block(channels) for _ in range(num_res_blocks)])
        self.policy_conv = nn.Conv2d(channels, 2, kernel_size=1)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * 81, 81)
        self.value_conv = nn.Conv2d(channels, 1, kernel_size=1)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(81, 256)
        self.value_fc2 = nn.Linear(256, 1)

    def _make_res_block(self, channels):
        return nn.Sequential(
            nn.Conv2d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(channels)
        )

    def forward(self, x):
        x = F.relu(self.bn1(self.conv1(x)))
        for block in self.res_blocks:
            x_residual = block(x)
            x = x + x_residual
            x = F.relu(x)
        
        policy = F.relu(self.policy_bn(self.policy_conv(x)))
        policy = policy.view(policy.size(0), -1)
        policy = self.policy_fc(policy)
        policy = F.softmax(policy, dim=1)
        
        value = F.relu(self.value_bn(self.value_conv(x)))
        value = value.view(value.size(0), -1)
        value = F.relu(self.value_fc1(value))
        value = torch.tanh(self.value_fc2(value))
        
        return policy, value


class MCTS:
    def __init__(self, nnet, c_puct=2.0, num_sims=500, device='cpu'):
        self.nnet = nnet
        self.c_puct = c_puct
        self.num_sims = num_sims
        self.device = device
        self.Nsa = {}
        self.Ns = {}
        self.Qsa = {}
        self.Ps = {}
        self.Vs = {}

    def search(self, root_state):
        root_key = root_state.to_key()
        for _ in range(self.num_sims):
            state = root_state
            path = []
            value = 0.0
            
            while True:
                if state.is_terminal():
                    v_abs = state.evaluate()
                    v_rel = v_abs * state.player
                    value = -v_rel
                    break
                
                state_key = state.to_key()
                actions = state.get_actions()

                if state_key not in self.Ps:
                    policy, v_rel = self._eval_state(state)
                    self.Ps[state_key] = policy
                    self.Vs[state_key] = v_rel
                    self.Ns[state_key] = 0
                    value = -v_rel
                    break

                best_action = None
                best_ucb = -float('inf')
                for action in actions:
                    idx = action[0] * 9 + action[1]
                    sa_key = (state_key, idx)
                    Nsa = self.Nsa.get(sa_key, 0)
                    Qsa = self.Qsa.get(sa_key, 0.0)
                    Ps = self.Ps[state_key][idx]
                    Ns = self.Ns[state_key]
                    Q = Qsa / (Nsa + 1e-8)
                    U = self.c_puct * Ps * np.sqrt(Ns + 1e-8) / (Nsa + 1)
                    if Q + U > best_ucb:
                        best_ucb = Q + U
                        best_action = action
                
                path.append((state_key, best_action))
                state = state.apply(best_action)

            for state_key, action in reversed(path):
                idx = action[0] * 9 + action[1]
                sa_key = (state_key, idx)
                self.Nsa[sa_key] = self.Nsa.get(sa_key, 0) + 1
                self.Qsa[sa_key] = self.Qsa.get(sa_key, 0) + value
                self.Ns[state_key] = self.Ns.get(state_key, 0) + 1
                value = -value

        root_key = root_state.to_key()
        counts = np.zeros(81)
        for action in root_state.get_actions():
            idx = action[0] * 9 + action[1]
            counts[idx] = self.Nsa.get((root_key, idx), 0)
        
        if counts.sum() > 0: counts /= counts.sum()
        return counts

    def _eval_state(self, state):
        encoded = self._encode_state(state)
        tensor = torch.from_numpy(encoded).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            policy, value = self.nnet(tensor)
        return policy.cpu().numpy()[0], float(value.cpu().numpy()[0, 0])

    @staticmethod
    def _linear_to_spatial(flat_array):
        # converts a flat (81,) array ordered by macro-board (macro-major) into a (9, 9) spatial grid that the CNN can understand
        # reshape into (macro_row, macro_col, micro_row, micro_col)
            # shape becomes (3, 3, 3, 3)
        x = flat_array.reshape(3, 3, 3, 3)
        
        # swap axes to bring rows together and cols together
            # from (MR, MC, mR, mC) -> (MR, mR, MC, mC)
        x = x.transpose(0, 2, 1, 3)
        
        # fuse dimensions to form the 9x9 grid
            # (MR, mR) becomes global row (0-8)
            # (MC, mC) becomes global col (0-8)
        return x.reshape(9, 9)

    @staticmethod
    def _encode_state(state):
        # get the board as a flat array (macro-major)
        board_flat = np.array(state.board, dtype=np.float32)
        
        # convert to spatial 9x9
        board_spatial = MCTS._linear_to_spatial(board_flat)
        
        # create channels - we use board_spatial for the checks so the channels align spatially
        ch_own = (board_spatial == state.player).astype(np.float32)
        ch_opp = (board_spatial == -state.player).astype(np.float32)
        ch_turn = np.full((9, 9), state.player, dtype=np.float32)
        
        # create legal moves mask
        legal_mask_flat = np.zeros(81, dtype=np.float32)
        for m, c in state.get_actions():
            idx = m * 9 + c
            legal_mask_flat[idx] = 1.0
        legal_mask_spatial = MCTS._linear_to_spatial(legal_mask_flat)
        # stack (4, 9, 9)
        return np.stack([ch_own, ch_opp, ch_turn, legal_mask_spatial], axis=0)

    def reset(self):
        self.Nsa.clear(); self.Ns.clear(); self.Qsa.clear(); self.Ps.clear(); self.Vs.clear()


class SelfPlayBuffer:
    def __init__(self, max_size=250000):
        self.memory = deque(maxlen=max_size)
    def push(self, sample):
        self.memory.append(sample)
    def sample(self, batch_size):
        if len(self.memory) < batch_size: batch_size = len(self.memory)
        batch = random.sample(list(self.memory), batch_size)
        states = np.array([item[0] for item in batch])
        policies = np.array([item[1] for item in batch])
        values = np.array([item[2] for item in batch]).reshape(-1, 1)
        return states, policies, values
    def __len__(self):
        return len(self.memory)

def play_game(nnet, device, num_sims):
    state = UTTTState()
    trajectory = []
    move_count = 0
    mcts = MCTS(nnet, c_puct=1.5, num_sims=num_sims, device=device)

    while not state.is_terminal() and move_count < 81:
        mcts.reset()
        policy = mcts.search(state)
        state_encoded = MCTS._encode_state(state)
        trajectory.append((state_encoded, policy, None))
        
        # select action
        legal_moves = state.get_actions()
        probs = np.zeros(81)
        for m, c in legal_moves: probs[m*9+c] = policy[m*9+c]
        if probs.sum() > 0: probs /= probs.sum()
        else: probs[random.choice([m*9+c for m,c in legal_moves])] = 1.0

        if move_count < 30: action_idx = np.random.choice(81, p=probs)
        else: action_idx = np.argmax(probs)
        
        state = state.apply((action_idx // 9, action_idx % 9))
        move_count += 1

    outcome = state.evaluate()
    return [(item[0], item[1], outcome * (1 if i%2==0 else -1)) for i, item in enumerate(trajectory)]


class BatchMCTS:
    def __init__(self, nnet, batch_size, c_puct=1.0, num_sims=800, device='cuda'):
        self.nnet = nnet
        self.batch_size = batch_size
        self.c_puct = c_puct
        self.num_sims = num_sims
        self.device = device
        self.trees = [{'Nsa': {}, 'Ns': {}, 'Qsa': {}, 'Ps': {}, 'Vs': {}} 
                      for _ in range(batch_size)]

    def reset(self, indices=None):
        if indices is None: indices = range(self.batch_size)
        for i in indices:
            self.trees[i] = {'Nsa': {}, 'Ns': {}, 'Qsa': {}, 'Ps': {}, 'Vs': {}}

    def search(self, states, noise=False):
        # hyperparameters for dirichlet noise
        DIRICHLET_ALPHA = 0.3   
        EPSILON = 0.25          # 25% noise, 75% neural net

        for _ in range(self.num_sims):
            leaves = []
            paths = []
            valid_indices = []

            # select
            for i, state in enumerate(states):
                tree = self.trees[i]
                current_state = state
                path = []
                
                while True:
                    if current_state.is_terminal():
                        path.append((None, None))
                        break

                    state_key = current_state.to_key()

                    if state_key not in tree['Ps']:
                        valid_indices.append(i)
                        leaves.append(current_state)
                        break
                    
                    best_action = None
                    best_ucb = -float('inf')
                    actions = current_state.get_actions()
                    
                    for action in actions:
                        idx = action[0] * 9 + action[1]
                        sa_key = (state_key, idx)
                        
                        Nsa = tree['Nsa'].get(sa_key, 0)
                        Qsa = tree['Qsa'].get(sa_key, 0.0)
                        Ps = tree['Ps'][state_key][idx]
                        Ns = tree['Ns'][state_key]
                        
                        Q = Qsa / (Nsa + 1e-8)
                        U = self.c_puct * Ps * np.sqrt(Ns + 1e-8) / (Nsa + 1)
                        
                        if Q + U > best_ucb:
                            best_ucb = Q + U
                            best_action = action
                    
                    path.append((state_key, best_action))
                    current_state = current_state.apply(best_action)
                
                paths.append(path)

            # evaluate
            if leaves:
                encoded_leaves = np.array([MCTS._encode_state(s) for s in leaves])
                tensor = torch.from_numpy(encoded_leaves).float().to(self.device)
                with torch.no_grad():
                    policies, values = self.nnet(tensor)
                policies = policies.cpu().numpy()
                values = values.cpu().numpy()

            # backprop
            leaf_idx = 0
            for i in range(self.batch_size):
                tree = self.trees[i]
                path = paths[i]
                
                if path and path[-1][0] is None:
                    # terminal handling
                    temp_state = states[i]
                    for node_key, action in path[:-1]:
                        temp_state = temp_state.apply(action)
                    v = temp_state.evaluate() * temp_state.player
                    value = -v
                else:
                    if leaf_idx < len(leaves):
                        leaf_state = leaves[leaf_idx]
                        leaf_key = leaf_state.to_key()
                        
                        # add dirichlet noise only to the root node
                            # we are at the root if the path is empty (meaning we selected the root immediately)
                        is_root = (len(path) == 0)
                        
                        current_policy = policies[leaf_idx]

                        if noise and is_root:
                            # get legal moves
                            legal_moves = leaf_state.get_actions()
                            legal_indices = [m*9 + c for m, c in legal_moves]
                            
                            # generate noise
                            noise_vec = np.random.dirichlet([DIRICHLET_ALPHA] * len(legal_indices))
                            
                            # mix noise into the legal slots of the policy
                                # we normalize the existing policy subset first to be safe
                            policy_subset = current_policy[legal_indices]
                            if policy_subset.sum() > 0:
                                policy_subset /= policy_subset.sum()
                            
                            mixed_policy = (1 - EPSILON) * policy_subset + EPSILON * noise_vec
                            
                            # write back
                            current_policy[legal_indices] = mixed_policy

                        tree['Ps'][leaf_key] = current_policy
                        tree['Vs'][leaf_key] = values[leaf_idx]
                        tree['Ns'][leaf_key] = 0
                        
                        value = -float(values[leaf_idx])
                        leaf_idx += 1
                    else:
                        continue

                # propagate
                iter_path = reversed(path[:-1]) if path and path[-1][0] is None else reversed(path)
                for state_key, action in iter_path:
                    idx = action[0] * 9 + action[1]
                    sa_key = (state_key, idx)
                    tree['Nsa'][sa_key] = tree['Nsa'].get(sa_key, 0) + 1
                    tree['Qsa'][sa_key] = tree['Qsa'].get(sa_key, 0) + value
                    tree['Ns'][state_key] = tree['Ns'].get(state_key, 0) + 1
                    value = -value

        # return policies
        final_policies = []
        for i, state in enumerate(states):
            tree = self.trees[i]
            root_key = state.to_key()
            counts = np.zeros(81)
            if state.is_terminal():
                final_policies.append(counts)
                continue
            for action in state.get_actions():
                idx = action[0] * 9 + action[1]
                counts[idx] = tree['Nsa'].get((root_key, idx), 0)
            if counts.sum() > 0: counts /= counts.sum()
            final_policies.append(counts)
            
        return final_policies