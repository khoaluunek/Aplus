const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const consultationHandler = require("../api/consultation");

function multipartBody(fields, file) {
  const boundary = "----AplusScholarBoundary";
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="brief-file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(chunks) };
}

async function submit(fields, file) {
  const payload = multipartBody(fields, file);
  const request = Readable.from(payload.body);
  request.method = "POST";
  request.headers = {
    origin: "https://aplus-scholar.vercel.app",
    "content-type": `multipart/form-data; boundary=${payload.boundary}`
  };
  const response = {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; }
  };
  await consultationHandler(request, response);
  return response;
}

const baseFields = {
  name: "Nguyen An",
  contactMethod: "email",
  email: "an@example.com",
  phone: "",
  contactTime: "",
  need: "Hỗ trợ học thuật",
  message: "Cần trao đổi đề cương",
  consent: "on",
  website: ""
};

(async () => {
  const validContact = await submit(baseFields);
  assert.equal(validContact.statusCode, 503, "Valid multipart request should reach email configuration check");

  const missingPhone = await submit({ ...baseFields, contactMethod: "phone", email: "" });
  assert.equal(missingPhone.statusCode, 400, "Phone channel requires a valid phone number");

  const spoofedPdf = await submit(baseFields, {
    name: "brief.pdf",
    type: "application/pdf",
    content: Buffer.from("plain text")
  });
  assert.equal(spoofedPdf.statusCode, 400, "Spoofed PDF must be rejected by signature validation");

  const signedPdf = await submit(baseFields, {
    name: "brief.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4\n%%EOF")
  });
  assert.equal(signedPdf.statusCode, 503, "Signed PDF should pass validation and reach email configuration check");

  console.log("consultation multipart tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
