/**
 * Returns a simple category name based on MIME type
 * @param {string} mimeType - e.g. "image/png", "video/mp4", "application/pdf"
 * @returns {string} category - "image" | "video" | "audio" | "document" | "archive" | "code" | "font" | "other"
 */
function getFileCategory(mimeType = "") {
  if (!mimeType || typeof mimeType !== "string") return "other";

  const type = mimeType.toLowerCase().trim();

  // Image
  if (type.startsWith("image/")) return "image";

  // Video
  if (type.startsWith("video/")) return "video";

  // Audio
  if (type.startsWith("audio/")) return "audio";

  // Fonts
  if (
    type.startsWith("font/") ||
    type === "application/font-woff" ||
    type === "application/font-woff2" ||
    type === "application/x-font-ttf" ||
    type === "application/x-font-otf"
  ) {
    return "font";
  }

  // Archives
  if (
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/x-rar-compressed" ||
    type === "application/vnd.rar" ||
    type === "application/x-7z-compressed" ||
    type === "application/gzip" ||
    type === "application/x-tar" ||
    type === "application/x-bzip" ||
    type === "application/x-bzip2"
  ) {
    return "archive";
  }

  // Code / text
  if (
    type.startsWith("text/") ||
    type === "application/javascript" ||
    type === "application/typescript" ||
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/x-sh" ||
    type === "application/x-httpd-php"
  ) {
    return "code";
  }

  // Documents
  if (
    type === "application/pdf" ||
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // .docx
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
    type === "application/vnd.ms-powerpoint" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || // .pptx
    type === "application/rtf" ||
    type === "application/vnd.oasis.opendocument.text" ||
    type === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return "document";
  }

  return "other";
}