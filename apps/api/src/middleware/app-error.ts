export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: ErrorDetail[] = [],
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}
