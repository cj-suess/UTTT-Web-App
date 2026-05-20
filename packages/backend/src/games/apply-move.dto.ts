import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

/**
 * Request body for `POST /games/:id/moves`.
 *
 * Wire shape: `{ "move": [m, c] }` where `m` is the macro index (0–8) and
 * `c` is the cell within that macro (0–8). The tuple format matches the
 * Python inference service so move data flows through untransformed.
 *
 * The `each: true` option applies a validator to every element of the array
 * rather than the array as a whole. Combined with the size constraints, this
 * enforces "exactly two integers, each between 0 and 8."
 */
export class ApplyMoveDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(8, { each: true })
  move!: [number, number];
}