const { handler } = require("../index");

// Mock AWS SDK
jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/client-kms");

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");

// Helper for async iterable
function bufferAsyncIterable(buffer) {
  return (async function* () {
    yield buffer;
  })();
}

// Custom error classes for S3 errors
class NoSuchKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = "NoSuchKey";
  }
}
class AccessDeniedException extends Error {
  constructor(message) {
    super(message);
    this.name = "AccessDeniedException";
  }
}

describe("Lambda Handler", () => {
  let mockS3Client;
  let mockKmsClient;

  beforeEach(() => {
    process.env.S3_BUCKET_NAME = "test-bucket";
    process.env.KMS_KEY_ID = "test-key-id";

    mockS3Client = {
      send: jest.fn(),
    };
    S3Client.mockImplementation(() => mockS3Client);

    mockKmsClient = {
      send: jest.fn(),
    };
    KMSClient.mockImplementation(() => mockKmsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should successfully decrypt blob", async () => {
    mockS3Client.send.mockResolvedValue({
      Body: bufferAsyncIterable(Buffer.from("encrypted-data")),
    });
    mockKmsClient.send.mockResolvedValue({
      Plaintext: Buffer.from("decrypted-content"),
    });
    const event = {
      body: JSON.stringify({ blobKey: "test-blob-key" }),
    };
    const result = await handler(event, {});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ plaintext: "decrypted-content" });
    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("should return 400 for missing blobKey", async () => {
    mockS3Client.send.mockResolvedValue({
      Body: bufferAsyncIterable(Buffer.from("irrelevant")),
    });
    const event = { body: JSON.stringify({}) };
    const result = await handler(event, {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing required parameter: blobKey",
    });
  });

  test("should return 404 for blob not found", async () => {
    mockS3Client.send.mockImplementationOnce(() =>
      Promise.reject(new NoSuchKeyError("Not found"))
    );
    const event = { body: JSON.stringify({ blobKey: "non-existent-blob" }) };
    const result = await handler(event, {});
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "Blob not found" });
  });

  test("should return 403 for access denied", async () => {
    mockS3Client.send.mockImplementationOnce(() =>
      Promise.reject(new AccessDeniedException("Access denied"))
    );
    const event = { body: JSON.stringify({ blobKey: "restricted-blob" }) };
    const result = await handler(event, {});
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      error: "Access denied - insufficient permissions",
    });
  });

  test("should return 500 for general errors", async () => {
    mockS3Client.send.mockImplementationOnce(() =>
      Promise.reject(new Error("Unexpected error"))
    );
    const event = { body: JSON.stringify({ blobKey: "test-blob" }) };
    const result = await handler(event, {});
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: "Internal server error" });
  });

  test("should handle empty body gracefully", async () => {
    mockS3Client.send.mockResolvedValue({
      Body: bufferAsyncIterable(Buffer.from("irrelevant")),
    });
    const event = {};
    const result = await handler(event, {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing required parameter: blobKey",
    });
  });
});
