const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");

const s3Client = new S3Client();
const kmsClient = new KMSClient();


const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const KMS_KEY_ID = process.env.KMS_KEY_ID;


exports.handler = async (event, context) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || "{}");
    const { blobKey } = body;

    if (!blobKey) {
      return createResponse(400, {
        error: "Missing required parameter: blobKey",
      });
    }

    console.log(`Processing blobKey: ${blobKey}`);

    let encryptedBlob;
    try {
      const s3Response = await fetchFromS3(blobKey);
      if (!s3Response) {
        console.error("[S3 ERROR] Invalid S3 response");
        return createResponse(500, { error: "Internal server error" });
      }
      encryptedBlob = s3Response;
      console.log(
        `Retrieved encrypted blob, size: ${encryptedBlob.length} bytes`
      );
    } catch (error) {
      console.error("[S3 ERROR]", error, "name:", error.name);
      if (error.name === "NoSuchKey") {
        return createResponse(404, { error: "Blob not found" });
      }
      if (error.name === "AccessDeniedException") {
        return createResponse(403, {
          error: "Access denied - insufficient permissions",
        });
      }
      return createResponse(500, { error: "Internal server error" });
    }

    let plaintext;
    try {
      plaintext = await decryptWithKMS(encryptedBlob);
      console.log("Successfully decrypted blob");
    } catch (error) {
      console.error("[KMS ERROR]", error, "name:", error.name);
      if (error.name === "AccessDeniedException") {
        return createResponse(403, {
          error: "Access denied - insufficient permissions",
        });
      }
      return createResponse(500, { error: "Internal server error" });
    }

    return createResponse(200, {
      plaintext: plaintext,
    });
  } catch (error) {
    console.error("Error:", error);
    return createResponse(500, {
      error: "Internal server error",
    });
  }
};

async function fetchFromS3(blobKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: blobKey,
    });
    const response = await s3Client.send(command);
    if (
      !response ||
      !response.Body ||
      typeof response.Body[Symbol.asyncIterator] !== "function"
    ) {
      return null;
    }
    
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    throw err;
  }
}

async function decryptWithKMS(encryptedBlob) {
  const command = new DecryptCommand({
    CiphertextBlob: encryptedBlob,
    KeyId: KMS_KEY_ID,
  });

  const response = await kmsClient.send(command);

  
  return response.Plaintext.toString("utf-8");
}

function createResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
