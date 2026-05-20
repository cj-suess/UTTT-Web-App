"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplyMoveDto = void 0;
const class_validator_1 = require("class-validator");
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
class ApplyMoveDto {
    move;
}
exports.ApplyMoveDto = ApplyMoveDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2),
    (0, class_validator_1.ArrayMaxSize)(2),
    (0, class_validator_1.IsInt)({ each: true }),
    (0, class_validator_1.Min)(0, { each: true }),
    (0, class_validator_1.Max)(8, { each: true }),
    __metadata("design:type", Array)
], ApplyMoveDto.prototype, "move", void 0);
//# sourceMappingURL=apply-move.dto.js.map