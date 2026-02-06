import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/ensure-user";
import { extractContactsFromFile } from "@/lib/extract-contacts-from-file";
import * as XLSX from "xlsx";

const ALLOWED_EXTENSIONS = [
  ".csv",
  ".tsv",
  ".xlsx",
  ".xls",
  ".txt",
  ".md",
  ".json",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Convert an Excel workbook (xlsx/xls) buffer to CSV text
 */
function excelToText(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      sheets.push(csv);
    }
  }

  return sheets.join("\n\n");
}

/**
 * POST /api/import - Upload a file and extract contacts using AI
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    const ext = "." + fileName.split(".").pop();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${ext}. Supported types: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    let fileContent: string;

    // Convert Excel files to CSV text first
    if (ext === ".xlsx" || ext === ".xls") {
      const buffer = await file.arrayBuffer();
      fileContent = excelToText(buffer);
    } else {
      fileContent = await file.text();
    }

    if (!fileContent.trim()) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }

    // Extract contacts using AI
    const contacts = await extractContactsFromFile(fileContent);

    return NextResponse.json({
      contacts,
      fileName: file.name,
      count: contacts.length,
    });
  } catch (err) {
    console.error("Failed to import file:", err);
    return NextResponse.json(
      { error: "Failed to process file. Please try again." },
      { status: 500 }
    );
  }
}
