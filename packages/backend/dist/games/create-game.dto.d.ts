export type Difficulty = 'easy' | 'medium' | 'hard';
export declare class CreateGameDto {
    playerName: string;
    difficulty: Difficulty;
}
