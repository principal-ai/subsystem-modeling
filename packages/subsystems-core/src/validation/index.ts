/**
 * Validation Module
 *
 * Exports validation functions for various Principal View data structures.
 */

export {
  validateLibraryStructure,
  type LibraryValidationError,
  type LibraryValidationErrorType,
  type LibraryValidationResult,
} from './libraryValidation';

export {
  OtelCanvasValidator,
  type OtelCanvasViolation,
} from './OtelCanvasValidator';
