export class HttpException extends Error {
  public statusCode: number;
  public message: string;
  public data?: any;
  public headers?: HeadersInit; // To hold custom headers

  constructor(
    statusCode: number,
    message: string,
    data?: any,
    headers?: HeadersInit
  ) {
    super(message);
    this.name = "HttpException";
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.headers = headers; // Store custom headers

    // Set the prototype explicitly
    Object.setPrototypeOf(this, HttpException.prototype);
  }

  // Method to generate a standard JavaScript Response object
  public getResponse(): Response {
    const responseBody = {
      statusCode: this.statusCode,
      message: this.message,
      ...(this.data && { data: this.data }), // Only include data if it's provided
    };

    return new Response(
      this.data ? JSON.stringify(responseBody) : this.message,
      {
        status: this.statusCode,
        headers: {
          "Content-Type": "application/json",
          ...(this.headers && { ...this.headers }), // Include user-defined headers
        },
      }
    );
  }
}
