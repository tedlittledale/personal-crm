import { redirect } from "next/navigation";

const SHORTCUT_ICLOUD_URL =
  "https://www.icloud.com/shortcuts/9d6c7110dbd140088d99556ef4913ab3";

// GET /api/settings/shortcut - Redirect to iCloud shortcut link
export async function GET() {
  redirect(SHORTCUT_ICLOUD_URL);
}
