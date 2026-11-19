/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(400, message, fields);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
