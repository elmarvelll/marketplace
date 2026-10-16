// src/lib/service-error.ts
//
// The one error type every services/marketplace/** function throws instead
// of building a NextResponse itself — services stay framework-agnostic
// (no next/server import), and every API controller catches ServiceError
// via src/lib/controller-helpers.ts#serviceErrorResponse to turn it into
// the right HTTP status. Anything a service throws that ISN'T a
// ServiceError is treated as unexpected and surfaces as a 500.

export class ServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}

export const unauthorized = (message = "Not signed in.") => new ServiceError(401, message);
export const forbidden = (message = "You don't have access to this.") => new ServiceError(403, message);
export const notFound = (message = "Not found.") => new ServiceError(404, message);
export const badRequest = (message = "Bad request.") => new ServiceError(400, message);
export const conflict = (message = "Conflict.") => new ServiceError(409, message);
export const paymentRequired = (message = "Payment required.") => new ServiceError(402, message);
export const unprocessable = (message = "Couldn't process that request.") => new ServiceError(422, message);
export const badGateway = (message = "Upstream request failed.") => new ServiceError(502, message);
export const tooManyRequests = (message = "Too many requests. Please try again shortly.") => new ServiceError(429, message);
