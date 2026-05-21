import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';


export class CreateGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  playerName!: string;
}