// Short-lived, single-use tickets that let an agent push a local file into the
// media library without ever holding the organization's API key.
//
// The MCP tool mints a ticket (it is already authenticated as the org) and
// hands back a URL; the agent POSTs the file to that URL as multipart form
// data. The receiving route is unauthenticated by design — the ticket itself
// is the credential — so it is a 256-bit random token, expires quickly, is
// burned on the first successful upload, and can only ever add a file to the
// organization it was minted for.
export const UPLOAD_TICKET_TTL_SECONDS = 900;

export const uploadTicketKey = (token: string) => `mcp:upload-ticket:${token}`;

// The same kind of ticket for the brief onboarding, which may also carry
// documents (see brief.upload.ts). Kept under its own key so an ordinary
// ticket can never be used for a document.
export const briefUploadTicketKey = (token: string) =>
  `mcp:brief-upload-ticket:${token}`;
