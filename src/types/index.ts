/**
 * TJS Type System
 *
 * Runtime types with descriptions and validation.
 */

export {
  Type,
  isRuntimeType,
  type RuntimeType,
  // Built-in types
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  // Combinators
  Nullable,
  Optional,
  Union,
  TArray,
} from './Type'
