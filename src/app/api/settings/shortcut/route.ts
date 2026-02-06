import { redirect } from "next/navigation";

const SHORTCUT_ICLOUD_URL =
  "https://www.icloud.com/shortcuts/f7d359d6c3924fd994ef426f7def813a";

// GET /api/settings/shortcut - Redirect to iCloud shortcut link
export async function GET() {
  redirect(SHORTCUT_ICLOUD_URL);
}
