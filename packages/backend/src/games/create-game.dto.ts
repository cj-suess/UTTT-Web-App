import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export type Difficulty = 'easy' | 'medium' | 'hard';

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  playerName!: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty: Difficulty = 'hard';
}
