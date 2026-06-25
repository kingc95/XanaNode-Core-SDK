export class XanaNodeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "XanaNodeError";
    this.details = details;
  }
}

export class ValidationError extends XanaNodeError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "ValidationError";
  }
}
