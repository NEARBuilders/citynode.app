export class ApiError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 502 | 503 = 400,
  ) {
    super(code);
  }
}
